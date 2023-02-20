import { ReceiverTxnManager } from './ReceiverTxnManager'
import { intGeneratorFactory } from '../idGenerators'
import { SuccessStatusMessage } from '../messagesTypes'

jest.mock('../idGenerators')
const mockIntGeneratorFactory = intGeneratorFactory as jest.Mock
let idx = 1
const mockDefaultGenerator = jest.fn().mockImplementation(() => `${idx++}`)
mockIntGeneratorFactory.mockImplementation(() => mockDefaultGenerator)

describe('RecieverTxnManager', () => {
  describe('method calls', () => {
    it('stores a txn for start()', async () => {
      const txnManager = new ReceiverTxnManager()

      expect(
        txnManager.start('txn', {
          onAck: jest.fn(),
          onNack: jest.fn(),
          onTimeout: jest.fn(),
        }),
      ).toBe(true)

      expect(txnManager.has('txn')).toBe(true)
    })
    it('will not start a duplicate txn for start()', async () => {
      const txnManager = new ReceiverTxnManager()

      expect(
        txnManager.start('txn', {
          onAck: jest.fn(),
          onNack: jest.fn(),
          onTimeout: jest.fn(),
        }),
      ).toBe(true)
      expect(
        txnManager.start('txn', {
          onAck: jest.fn(),
          onNack: jest.fn(),
          onTimeout: jest.fn(),
        }),
      ).toBe(false)

      expect(txnManager.has('txn')).toBe(true)
    })
    it('calls on onAck() for appropriate txn', async () => {
      const txnManager = new ReceiverTxnManager()

      const onAckMock = jest.fn()
      const onAckMock2 = jest.fn()

      txnManager.start('txn', {
        onAck: onAckMock,
        onNack: jest.fn(),
        onTimeout: jest.fn(),
      })
      // Make a second transaction for testing
      txnManager.start('txn2', {
        onAck: onAckMock2,
        onNack: jest.fn(),
        onTimeout: jest.fn(),
      })

      await txnManager.ack('txn2')

      expect(onAckMock2).toHaveBeenCalledTimes(1)
    })
    it('calls on onNack() for appropriate txn and removes it', async () => {
      const txnManager = new ReceiverTxnManager()

      const onNackMock = jest.fn()
      const onNackMock2 = jest.fn()

      txnManager.start('txn', {
        onAck: jest.fn(),
        onNack: onNackMock,
        onTimeout: jest.fn(),
      })
      // Make a second transaction for testing
      txnManager.start('txn2', {
        onAck: jest.fn(),
        onNack: onNackMock2,
        onTimeout: jest.fn(),
      })

      await txnManager.nack('txn')

      expect(onNackMock).toHaveBeenCalledTimes(1)
      expect(txnManager.has('txn')).toBe(false)
    })
    it('is null tolerant for calls', async () => {
      const txnManager = new ReceiverTxnManager()

      const onAckMock = jest.fn()
      const onNackMock = jest.fn()

      txnManager.start('txn', {
        onAck: onAckMock,
        onNack: onNackMock,
        onTimeout: jest.fn(),
      })

      txnManager.remove('txn')

      await txnManager.ack('txn')
      await txnManager.nack('txn')

      expect(onAckMock).not.toHaveBeenCalled()
      expect(onNackMock).not.toHaveBeenCalled()
    })
  })
})
