const koa = jest.genMockFromModule('koa')

koa.prototype.use = jest.fn().mockImplementationOnce(async (ctx, next) => {
  await next()
})

module.exports = koa
