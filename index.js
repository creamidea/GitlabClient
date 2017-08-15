const { URL } = require('url')
const request = require('request')
const Oauth2Client = require('Oauth2Client')

class GitlabClient extends Oauth2Client {
  constructor (params) {
    params = Object.assign({},
      {
        oauthPath: '/oauth/authorize',
        tokenPath: '/oauth/token',
        apiPath: '/api/v3',
        scope: 'api'
      },
      params)
    params.baseUrl = params.baseUrl.replace(/\/+$/, '')
    super(params)
  }

  // 授权码如下
  // 10 => Guest access
  // 20 => Reporter access
  // 30 => Developer access
  // 40 => Master access
  // 50 => Owner access # Only valid for groups
  // 校验逻辑
  // 1. 获取项目信息，如果返回状态码非 2xx，说明无权限(404)或出错，则直接抛异常结束
  // 2. 上述查询返回成功，查看项目是否是 public。是，直接正常退出；否，则进入下一步
  // 3. 接上一步，继续查看该访问者是否在项目(project)成员列表中。
  //    如果存在，则正常退出。如果不在 (404等其他情况)，则进入下一步（异常捕获）。
  // 4. 上一步异常捕获阶段，判定是不是 404 错误。
  //    是，则继续查询该成员是否在项目组中，如果在，则正常退出，不在则将异常抛出；
  //    否，则抛出异常
  // 状态码为 200，则表示成功，无任何返回。其余情况都为失败，抛出异常
  auth ({ token, userId }) {
    const self = this
    return async (projectId) => {
      // 查找项目信息，找不到（包括没有权限）抛出 404
      const project = await self.request({
        uri: self.api(`/projects/${projectId}`)
      }, token)
      if (!project.public) {
        try {
          // 查询 project 成员，找不到抛出 404 异常
          await self.request({
            uri: self.api(`/projects/${projectId}/members/${userId}`)
          }, token)
        } catch (err) {
          if (err.statusCode === 404) {
            // 查找 project 所属 group 成员，找不到抛出异常
            const groupId = projectId.split('%2F')[0]
            const membersInGroup = await self.request({
              uri: self.api(`/groups/${groupId}/members`)
            }, token)
            if (!membersInGroup.find(u => u.id === userId)) {
              throw new Error({
                statusCode: 404,
                body: '{"message":"404 Project Not Found"}'
              })
            }
          } else {
            throw err
          }
        }
      }
    }
  }

  // 校验是不是从 gitlab 回跳过来的地址
  validatePath (pathname) {
    const { redirectURI } = this.params
    const oRedirectURI = new URL(redirectURI)
    return oRedirectURI.pathname === pathname
  }

  // 包装函数
  wrap (next) {
    const self = this
    return async function (ctx, _next) {
      await self.filter()(ctx, async () => { await next(ctx, _next) })
    }
  }

  api (resource) {
    const { apiPath, baseUrl } = this.params
    return (new URL(resource.replace(/^\/+/, ''), `${baseUrl}${apiPath}/`)).toString()
  }

  async request (opt = {}, token) {
    return new Promise((resolve, reject) => {
      request(opt, (err, res, body) => {
        if (err || res.statusCode > 299) {
          reject(err || res)
        } else {
          resolve(JSON.parse(body))
        }
      }).auth(null, null, true, token) // https://github.com/request/request#http-authentication
    })
  }

  // 中间件
  filter () {
    const self = this
    return async (ctx, next) => {
      if (ctx.query.code) {
        if (!self.validatePath(ctx.path)) {
          ctx.throw(401, 'The PATH is Unauthorized.')
          return
        }
        try {
          const body = await self.requestToken(ctx.query.code)
          const {
            access_token: accessToken
            // token_type: tokenType,
            // refresh_token: refreshToken,
            // scope,
            // created_at: createdAt
          } = body
          const user = await self.request({ uri: self.api('/user') }, accessToken)

          // TODO: 目前这里只需要用到 ID
          ctx.session.user = {
            id: user.id
          }
          ctx.session.access_token = accessToken
          // ctx.session.token_type = tokenType
          // ctx.session.refresh_token = refreshToken
          // ctx.session.scope = scope
          // ctx.session.created_at = createdAt
          return ctx.redirect(
            ctx.session.redirect_url ||
            ctx.url.replace(/\??code=[\d\w]+&?/, '')
          )
        } catch (err) {
          if (err.statusCode === 401) {
            return self.redirectToAuthorizedURI(ctx)
          } else {
            ctx.statusCode = err.statusCode || 500
            ctx.body = err.body || '服务器内部发生错误。'
            ctx.log.error(err)
            return
          }
        }
      }

      const token = ctx.session.access_token
      if (!token) {
        ctx.session.redirect_url = ctx.url
        return self.redirectToAuthorizedURI(ctx)
      } else {
        ctx.gitlabAuth = self.auth({ token, userId: ctx.session.user && ctx.session.user.id })
        await next()
      }
    }
  }
}
module.exports = GitlabClient
