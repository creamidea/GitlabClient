const request = jest.fn()
  .mockImplementationOnce((opt, cb) => {
    cb(null, {}, '{"access_token": 100}')
    return {
      auth: jest.fn()
    }
  })
  .mockImplementationOnce((opt, cb) => {
    cb(new Error('request error'), {}, {})
  })

module.exports = request
