import {
  ACKMessage,
  CommandMessage,
  NACKMessage,
  SenderCloseCommand,
  SenderCloseStatusMessage,
  SenderCreateAckMessage,
  SenderCreateCommand,
  SenderCreateStatusMessage,
  StatusMessage,
} from './messagesTypes'
import { Server } from './Server'
import { MockConnection } from './testing/MockConnection'
import { wait } from './testing/utils'

type Commands = 'cmd1' | 'cmd2'
type CommandMap = {
  cmd1: CommandMessage<
    'cmd1',
    {
      value: number
    }
  >
  cmd2: CommandMessage<
    'cmd2',
    {
      huh: string
    }
  >
}
type StatusMap = {
  cmd1: StatusMessage<{
    product: string
  }>
  cmd2: StatusMessage<{
    huh: string
  }>
}

const mockDebug = jest.fn()

describe('Server', () => {
  let mockGenerator: () => string
  beforeEach(() => {
    let idx = 0
    mockGenerator = jest.fn().mockImplementation(() => {
      return `sender${++idx}`
    })
  })
  it('creates a Reciever for a sender', async () => {
    const connection = new MockConnection(2, 100)
    const server = new Server({
      ackRetryDelay: 100, // Milliseconds to wait to retry an non-ack'd send
      maxAckRetries: 2, // The number of retries we will do if we don't get an ACK
      connection,
      debug: mockDebug,
      maxSenderInactivity: 4000,
      idGenerator: mockGenerator,
    })

    const createSender: SenderCreateCommand<Record<string, never>> = {
      txn: '22',
      command: 'senderCreate',
      data: {},
    }
    await connection.simulateIncomingMessage(JSON.stringify(createSender))

    const expectedAck: SenderCreateAckMessage = {
      ack: 'senderCreate',
      txn: '22',
      timeout: 3000, // hard-baked
    }
    const expectedStatus: SenderCreateStatusMessage = {
      for: 'sender1',
      txn: '22',
      result: 'success',
      data: {
        inactivity: 4000,
      },
    }
    expect(connection.sendMessage).toHaveBeenCalledTimes(3)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedAck))
    // expect double send since we didn't get an ack back
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedStatus))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedStatus))

    expect(server.numberOfSenders()).toBe(1)

    await server.close()
  })
  it('Removes a Sender if a NACK is received on create status', async () => {
    const connection = new MockConnection(2, 100)
    const server = new Server({
      ackRetryDelay: 100, // Milliseconds to wait to retry an non-ack'd send
      maxAckRetries: 2, // The number of retries we will do if we don't get an ACK
      connection,
      debug: mockDebug,
      maxSenderInactivity: 4000,
      idGenerator: mockGenerator,
    })

    const createSender: SenderCreateCommand<Record<string, never>> = {
      txn: '22',
      command: 'senderCreate',
      data: {},
    }
    await connection.statusAck(async (): Promise<NACKMessage> => {
      return {
        nack: 'status',
        txn: '22',
        for: 'sender1',
        reason: 'badMessage',
      }
    })
    await connection.simulateIncomingMessage(JSON.stringify(createSender))

    const expectedAck: SenderCreateAckMessage = {
      ack: 'senderCreate',
      txn: '22',
      timeout: 3000, // hard-baked
    }
    const expectedStatus: SenderCreateStatusMessage = {
      for: 'sender1',
      txn: '22',
      result: 'success',
      data: {
        inactivity: 4000,
      },
    }
    expect(connection.sendMessage).toHaveBeenCalledTimes(3)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedAck))
    // expect double send since we didn't get an ack back
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedStatus))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedStatus))

    expect(server.numberOfSenders()).toBe(0)

    await server.close()
  })
  it('Removes a Sender if the sender misses the activity', async () => {
    const connection = new MockConnection(2, 100)
    const server = new Server({
      ackRetryDelay: 100, // Milliseconds to wait to retry an non-ack'd send
      maxAckRetries: 2, // The number of retries we will do if we don't get an ACK
      connection,
      debug: mockDebug,
      maxSenderInactivity: 500,
      idGenerator: mockGenerator,
    })

    const createSender: SenderCreateCommand<Record<string, never>> = {
      txn: '22',
      command: 'senderCreate',
      data: {},
    }
    await connection.simulateIncomingMessage(JSON.stringify(createSender))

    const expectedAck: SenderCreateAckMessage = {
      ack: 'senderCreate',
      txn: '22',
      timeout: 3000, // hard-baked
    }
    const expectedStatus: SenderCreateStatusMessage = {
      for: 'sender1',
      txn: '22',
      result: 'success',
      data: {
        inactivity: 500,
      },
    }
    expect(connection.sendMessage).toHaveBeenCalledTimes(3)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedAck))
    // expect double send since we didn't get an ack back
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedStatus))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedStatus))

    expect(server.numberOfSenders()).toBe(1)

    await wait(500)
    expect(server.numberOfSenders()).toBe(0)

    await server.close()
  })
  it('Maintains multiple Senders given timely activity', async () => {
    const connection = new MockConnection(2, 50)
    const server = new Server<Commands, CommandMap, StatusMap>({
      ackRetryDelay: 100, // Milliseconds to wait to retry an non-ack'd send
      maxAckRetries: 2, // The number of retries we will do if we don't get an ACK
      connection,
      debug: mockDebug,
      maxSenderInactivity: 500,
      idGenerator: mockGenerator,
    })

    const createSender: SenderCreateCommand<Record<string, never>> = {
      txn: '22',
      command: 'senderCreate',
      data: {},
    }
    await connection.simulateIncomingMessage(JSON.stringify(createSender))
    const createSender2: SenderCreateCommand<Record<string, never>> = {
      txn: '33',
      command: 'senderCreate',
      data: {},
    }
    await connection.simulateIncomingMessage(JSON.stringify(createSender2))

    const expectedAck: SenderCreateAckMessage = {
      ack: 'senderCreate',
      txn: '22',
      timeout: 3000, // hard-baked
    }
    const expectedStatus: SenderCreateStatusMessage = {
      for: 'sender1',
      txn: '22',
      result: 'success',
      data: {
        inactivity: 500,
      },
    }
    const expectedAck2: SenderCreateAckMessage = {
      ack: 'senderCreate',
      txn: '33',
      timeout: 3000, // hard-baked
    }
    const expectedStatus2: SenderCreateStatusMessage = {
      for: 'sender2',
      txn: '33',
      result: 'success',
      data: {
        inactivity: 500,
      },
    }
    expect(connection.sendMessage).toHaveBeenCalledTimes(6)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedAck))
    // expect double send since we didn't get an ack back
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedStatus))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedStatus))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(4, JSON.stringify(expectedAck2))
    // expect double send since we didn't get an ack back
    expect(connection.sendMessage).toHaveBeenNthCalledWith(5, JSON.stringify(expectedStatus2))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(6, JSON.stringify(expectedStatus2))

    expect(server.numberOfSenders()).toBe(2)

    connection.sendMessage.mockClear()
    // Register a cmd Handler
    server.setMessageHandler('cmd1', {
      handler: async (msg: CommandMap['cmd1']) => {
        return {
          isError: false,
          data: {
            product: 'ShamWOW',
          },
        }
      },
      maxTimeout: 6000,
    })
    // Give it a delay
    await wait(200)
    const command: CommandMap['cmd1'] = {
      for: 'sender2',
      txn: '44',
      command: 'cmd1',
      data: {
        value: 503,
      },
    }
    await connection.simulateIncomingMessage(JSON.stringify(command))

    const expectedAck3: ACKMessage = {
      ack: 'cmd1',
      for: 'sender2',
      txn: '44',
      timeout: 6000, // hard-baked
    }
    const expectedStatus3: StatusMap['cmd1'] = {
      for: 'sender2',
      txn: '44',
      result: 'success',
      data: {
        product: 'ShamWOW',
      },
    }
    expect(connection.sendMessage).toHaveBeenCalledTimes(3)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedAck3))
    // expect double send since we didn't get an ack back
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedStatus3))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedStatus3))

    // Verify 1 drops first (mock ack delays + time already past)
    await wait(200)
    expect(server.numberOfSenders()).toBe(1)

    await wait(200)
    expect(server.numberOfSenders()).toBe(0)

    await server.close()
  })
  it('Responds to senderClose commands', async () => {
    const connection = new MockConnection(2, 100)
    const server = new Server<Commands, CommandMap, StatusMap>({
      ackRetryDelay: 100, // Milliseconds to wait to retry an non-ack'd send
      maxAckRetries: 2, // The number of retries we will do if we don't get an ACK
      connection,
      debug: mockDebug,
      maxSenderInactivity: 500,
      idGenerator: mockGenerator,
    })

    const createSender: SenderCreateCommand<Record<string, never>> = {
      txn: '22',
      command: 'senderCreate',
      data: {},
    }
    await connection.simulateIncomingMessage(JSON.stringify(createSender))
    const createSender2: SenderCreateCommand<Record<string, never>> = {
      txn: '33',
      command: 'senderCreate',
      data: {},
    }
    await connection.simulateIncomingMessage(JSON.stringify(createSender2))

    const expectedAck: SenderCreateAckMessage = {
      ack: 'senderCreate',
      txn: '22',
      timeout: 3000, // hard-baked
    }
    const expectedStatus: SenderCreateStatusMessage = {
      for: 'sender1',
      txn: '22',
      result: 'success',
      data: {
        inactivity: 500,
      },
    }
    const expectedAck2: SenderCreateAckMessage = {
      ack: 'senderCreate',
      txn: '33',
      timeout: 3000, // hard-baked
    }
    const expectedStatus2: SenderCreateStatusMessage = {
      for: 'sender2',
      txn: '33',
      result: 'success',
      data: {
        inactivity: 500,
      },
    }
    expect(connection.sendMessage).toHaveBeenCalledTimes(6)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedAck))
    // expect double send since we didn't get an ack back
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedStatus))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedStatus))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(4, JSON.stringify(expectedAck2))
    // expect double send since we didn't get an ack back
    expect(connection.sendMessage).toHaveBeenNthCalledWith(5, JSON.stringify(expectedStatus2))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(6, JSON.stringify(expectedStatus2))

    expect(server.numberOfSenders()).toBe(2)

    connection.sendMessage.mockClear()
    const closeMsg: SenderCloseCommand<any> = {
      for: 'sender1',
      txn: '98',
      command: 'senderClose',
      data: {},
    }
    await connection.simulateIncomingMessage(JSON.stringify(closeMsg))

    const expectedAckClose: ACKMessage = {
      ack: 'senderClose',
      for: 'sender1',
      txn: '98',
    }
    const expectedStatusClose: SenderCloseStatusMessage = {
      for: 'sender1',
      txn: '98',
      result: 'success',
      data: {},
    }
    expect(connection.sendMessage).toHaveBeenCalledTimes(3)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedAckClose))
    // expect double send since we didn't get an ack back
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedStatusClose))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedStatusClose))

    expect(server.numberOfSenders()).toBe(1)

    connection.sendMessage.mockClear()

    // Register a cmd Handler
    server.setMessageHandler('cmd1', {
      handler: async (msg: CommandMap['cmd1']) => {
        return {
          isError: false,
          data: {
            product: 'ShamWOW',
          },
        }
      },
      maxTimeout: 6000,
    })
    // Give it a delay
    await wait(200)
    const command: CommandMap['cmd1'] = {
      for: 'sender2',
      txn: '44',
      command: 'cmd1',
      data: {
        value: 503,
      },
    }
    await connection.simulateIncomingMessage(JSON.stringify(command))

    const expectedAck3: ACKMessage = {
      ack: 'cmd1',
      for: 'sender2',
      txn: '44',
      timeout: 6000, // hard-baked
    }
    const expectedStatus3: StatusMap['cmd1'] = {
      for: 'sender2',
      txn: '44',
      result: 'success',
      data: {
        product: 'ShamWOW',
      },
    }
    expect(connection.sendMessage).toHaveBeenCalledTimes(3)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedAck3))
    // expect double send since we didn't get an ack back
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedStatus3))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedStatus3))

    // Let the next one drop
    await wait(500)
    expect(server.numberOfSenders()).toBe(0)

    await server.close()
  })
})
