# @creamery/gitlabclient
A simple gitlab client

But now, it should **be used with** middleware like [koa-session](https://github.com/koajs/session).
# Usage
```js
const GitlabClient = require('@creamery/gitlabclient')

const gitlabClient = new GitlabClient({
  baseUrl,
  appId,
  appSecret,
  [oauthPath],
  [tokenPath],
  [redirectURI],
  [apiPath],
  [scope]
})

...

app.use(async (ctx, next) => {
  const token = ctx.session.accessToken
  try {
    const user = await gitlabClient.request({ path: '/user' }, token)
  } catch (err) {
    console.log(err)
  }
  ...
})
```