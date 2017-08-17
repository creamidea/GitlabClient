const { URL } = require('url')
const path = require('path')
const GitlabClient = require('../index')

const mockError = jest.fn().mockImplementationOnce(() => { throw new Error('ctx error') })
const config = {
  baseUrl: 'http://github.com',
  appId: 'ce5f50ebf689b22436ae694aaf',
  appSecret: 'f08b1096054aa30a9a1ac4878c230',
  redirectURI: 'http://localhost:8080/oauth/authorized',

  oauthPath: '/oauth/authorize',
  tokenPath: '/oauth/token',
  apiPath: '/api/v3',
  scope: 'api'
}
const gitlabClient = new GitlabClient(config)

jest.mock('request')

describe('test url', () => {
  it('should return the correct api url', () => {
    const resource = '/user'
    const oUrl = new URL(gitlabClient.api(resource))

    expect(oUrl.pathname).toBe(path.join(config.apiPath, resource))
  })

  it('should be successful to validate the pathanme', () => {
    expect(gitlabClient.validatePath('/oauth/authorized')).toBeTruthy()
  })
})

describe('test request', () => {
  afterAll(() => {
    jest.mock('request').mockClear()
  })
  it('should be ok', async () => {
    const opt = {}
    const token = 'xxx'
    const body = await gitlabClient.request(opt, token) // .resolve.toBeInstanceOf(Object)
    expect(body).toHaveProperty('access_token')
  })
  it('should throw error', async () => {
    const opt = {}
    const token = 'xxx'
    try {
      await gitlabClient.request(opt, token)
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })
})

describe('test wrap', () => {
  it('should call correctly', async () => {
    const mockController = jest.fn()
    const ctx = {
      query: {},
      session: { accessToken: 'xxx' },
      throw: jest.fn()
    }

    await gitlabClient.wrap(mockController)(ctx, jest.fn())
    expect(mockController).toBeCalled()
  })
})

describe('test the auth function', () => {
  it('should throw error when get project members failed', async () => {
    const params = { token: 'xxx', userId: 100 }
    const projectId = 1000
    gitlabClient.request = jest.fn()
      .mockImplementationOnce(async () => ({
        public: false
      }))
      .mockImplementationOnce(async () => {
        throw mockError()
      })
    try {
      await gitlabClient.auth(params)(projectId)
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })
  it('should throw error when before getting the group member', async () => {
    jest.fn().mockClear()
    const params = { token: 'xxx', userId: 100 }
    const projectId = 1000

    gitlabClient.request = jest.fn()
      .mockImplementationOnce(async () => ({
        public: false
      }))
      .mockImplementationOnce(async () => {
        const err = { statusCode: 404 }
        throw err
      })
      .mockImplementationOnce(async () => {
        return []
      })

    try {
      await gitlabClient.auth(params)(projectId)
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })
  it('should throw 404 when not found group member', async () => {
    jest.fn().mockClear()
    const params = { token: 'xxx', userId: 100 }
    const projectId = 'client%2Fgoblin-web'

    gitlabClient.request = jest.fn()
      .mockImplementationOnce(async () => ({
        public: false
      }))
      .mockImplementationOnce(async () => {
        const err = { statusCode: 404 }
        throw err
      })
      .mockImplementationOnce(async () => {
        return []
      })

    try {
      await gitlabClient.auth(params)(projectId)
    } catch (err) {
      expect(err.statusCode).toBe(404)
    }
  })
})

describe('test middleware filter function', () => {
  it('should call redirect function if no has token', async () => {
    const ctx = {
      query: {},
      session: {},
      redirect: jest.fn()
    }

    await gitlabClient.filter()(ctx, async () => { })
    expect(ctx.redirect).toBeCalled()

    ctx.redirect.mockClear()
  })
  it('should call auth function if has token', async () => {
    const ctx = {
      query: {},
      session: {
        accessToken: 'adfzxcva123we'
      }
    }
    const mockNext = jest.fn()

    await gitlabClient.filter()(ctx, mockNext)
    expect(mockNext).toBeCalled()
    expect(ctx.gitlabAuth).toBeDefined()

    mockNext.mockClear()
  })
  it('should throw 401 if access wrong path with code', async () => {
    const ctx = {
      query: {
        code: 'xxx'
      },
      throw: mockError
    }
    try {
      await gitlabClient.filter()(ctx, async () => { })
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
    }
  })
  it('should redirect to the authorized url when throw 401', async () => {
    const ctx = {
      query: {
        code: 'xxx'
      },
      path: '/oauth/authorized',
      redirect: jest.fn(),
      throw: mockError
    }
    gitlabClient.requestToken = jest.fn()
      .mockImplementationOnce(async (code) => ({ access_token: 'xxx' }))
    gitlabClient.request = jest.fn()
      .mockImplementationOnce(async () => {
        const err = {
          statusCode: 401
        }
        throw err
      })
    try {
      await gitlabClient.filter()(ctx, async () => { })
    } catch (err) {
      expect(ctx.redirect).toBeCalled()
    }

    gitlabClient.requestToken.mockClear()
    gitlabClient.request.mockClear()
  })

  it('should throw error when the error happened', async () => {
    jest.fn().mockClear()
    const mockNext = jest.fn()
    const ctx = {
      query: {
        code: 'xxx'
      },
      path: '/oauth/authorized',
      log: {
        error: jest.fn()
      }
    }
    await gitlabClient.filter()(ctx, mockNext)
    expect(ctx.statusCode).toBe(500)
    expect(ctx.log.error).toBeCalled()
  })

  it('should success if everything is ok', async () => {
    const ctx = {
      query: {
        code: 'xxx'
      },
      session: {
        redirect_url: '/project/100'
      },
      log: {
        error: jest.fn()
      },
      path: '/oauth/authorized',
      redirect: jest.fn(),
      throw: mockError
    }
    const mockNext = jest.fn().mockImplementation(async () => {})
    gitlabClient.requestToken = jest.fn()
      .mockImplementation(async (code) => ({ access_token: 'xxx' }))
    gitlabClient.request = jest.fn()
      .mockImplementation(async (opt, token) => ({ id: 100 }))

    await gitlabClient.filter()(ctx, mockNext)

    expect(ctx.session.accessToken).toBe('xxx')
    expect(ctx.redirect).toBeCalled()
  })
})
