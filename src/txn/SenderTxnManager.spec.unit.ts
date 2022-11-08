import { SenderTxnManager } from './SenderTxnManager'
import { intGeneratorFactory } from '../idGenerators'
import { SuccessStatusMessage } from '../messagesTypes'

jest.mock('../idGenerators')
const mockIntGeneratorFactory = intGeneratorFactory as jest.Mock
let idx = 1
const mockDefaultGenerator = jest.fn().mockImplementation(() => `${idx++}`)
mockIntGeneratorFactory.mockImplementation(() => mockDefaultGenerator)

describe('SenderTxnManager', () => {
  describe('constructor', () => {
    it('uses default intGenerator if not provided', () => {
      const txnManager = new SenderTxnManager()

      expect(mockIntGeneratorFactory).toHaveBeenCalledTimes(1)

      const dummyListener = {
        onAck: async () => {
          //handling ack
        },
        onNack: async () => {
          // handling nack
        },
        onStatus: async (msg: string) => {
          // handling status
        },
      }
      const expIdx = idx
      const txn = txnManager.create(dummyListener)
      expect(txn).toBe(`${expIdx}`)
      expect(mockDefaultGenerator).toHaveBeenCalledTimes(1)
    })
    it('uses a custom idGenerator', () => {
      let id = ''
      const mockGenerator = jest.fn().mockImplementation(() => {
        id = `${id}a`
        return id
      })
      const txnManager = new SenderTxnManager({
        idGenerator: mockGenerator,
      })

      const dummyListener = {
        onAck: async () => {
          //handling ack
        },
        onNack: async () => {
          // handling nack
        },
        onStatus: async (msg: string) => {
          // handling status
        },
      }
      const txn = txnManager.create(dummyListener)
      expect(txn).toBe('a')
      const txn2 = txnManager.create(dummyListener)
      expect(txn2).toBe('aa')
      expect(mockGenerator).toHaveBeenCalledTimes(2)
    })
  })
  describe('method calls', () => {
    it('calls on onAck() for appropriate txn', async () => {
      const txnManager = new SenderTxnManager()

      const onAckMock = jest.fn()
      const onAckMock2 = jest.fn()

      const expTxn = idx
      const txn = txnManager.create({
        onAck: onAckMock,
        onNack: jest.fn(),
        onStatus: jest.fn(),
      })
      expect(txn).toBe(`${expTxn}`)
      // Make a second transaction for testing
      const expTxn2 = idx
      const txn2 = txnManager.create({
        onAck: onAckMock2,
        onNack: jest.fn(),
        onStatus: jest.fn(),
      })
      expect(txn2).toBe(`${expTxn2}`)

      await txnManager.ack(txn2)

      expect(onAckMock2).toHaveBeenCalledTimes(1)
    })
    it('calls on onNack() for appropriate txn and removes it', async () => {
      const txnManager = new SenderTxnManager()

      const onNackMock = jest.fn()
      const onNackMock2 = jest.fn()

      const expTxn = idx
      const txn = txnManager.create({
        onAck: jest.fn(),
        onNack: onNackMock,
        onStatus: jest.fn(),
      })
      expect(txn).toBe(`${expTxn}`)
      // Make a second transaction for testing
      const expTxn2 = idx
      const txn2 = txnManager.create({
        onAck: jest.fn(),
        onNack: onNackMock2,
        onStatus: jest.fn(),
      })
      expect(txn2).toBe(`${expTxn2}`)

      await txnManager.nack(txn)

      expect(onNackMock).toHaveBeenCalledTimes(1)
      expect(txnManager.has(txn)).toBe(false)
    })
    it('calls on onStatus() for appropriate txn with status', async () => {
      const txnManager = new SenderTxnManager()

      const onStatusMock = jest.fn()
      const onStatusMock2 = jest.fn()

      const expTxn = idx
      const txn = txnManager.create({
        onAck: jest.fn(),
        onNack: jest.fn(),
        onStatus: onStatusMock,
      })
      expect(txn).toBe(`${expTxn}`)
      // Make a second transaction for testing
      const expTxn2 = idx
      const txn2 = txnManager.create({
        onAck: jest.fn(),
        onNack: jest.fn(),
        onStatus: onStatusMock2,
      })
      expect(txn2).toBe(`${expTxn2}`)

      const msgObj: SuccessStatusMessage<any> = {
        result: 'success',
        txn: txn,
        for: 'senderId',
        data: {},
      }
      await txnManager.status(txn, msgObj)

      expect(onStatusMock).toHaveBeenCalledTimes(1)
      expect(onStatusMock).toHaveBeenCalledWith(msgObj)
    })
    it('null tolerant calls for status, ack, nack', async () => {
      const txnManager = new SenderTxnManager()

      const onStatusMock = jest.fn()
      const onAckMock = jest.fn()
      const onNackMock = jest.fn()

      const expTxn = idx
      const txn = txnManager.create({
        onAck: onAckMock,
        onNack: onNackMock,
        onStatus: onStatusMock,
      })
      expect(txn).toBe(`${expTxn}`)

      txnManager.remove(txn)

      const msgObj: SuccessStatusMessage<any> = {
        result: 'success',
        txn: txn,
        for: 'senderId',
        data: {},
      }
      await txnManager.status(txn, msgObj)

      expect(onStatusMock).not.toHaveBeenCalled()
      expect(onAckMock).not.toHaveBeenCalled()
      expect(onNackMock).not.toHaveBeenCalled()
    })
  })
})
