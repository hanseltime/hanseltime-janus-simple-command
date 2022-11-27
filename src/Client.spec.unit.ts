import { Client } from './Client'
import {
  ACKMessage,
  AuthSchema,
  CommandMessage,
  IntermediateStatusMessage,
  NACKMessage,
  SenderCloseCommand,
  SenderCreateCommand,
  SenderCreateStatusMessage,
  StatusMessage,
} from './messagesTypes'
import { MockConnection } from './testing/MockConnection'

/* eslint-disable no-var */
var mockGenerator: jest.Mock
/* eslint-enable no-var */
jest.mock('./txn/SenderTxnManager', () => {
  mockGenerator = jest.fn()
  const actual = jest.requireActual('./txn/SenderTxnManager')
  return {
    ...actual,
    SenderTxnManager: jest.fn().mockImplementation(() => {
      return new actual.SenderTxnManager({
        idGenerator: mockGenerator,
      })
    }),
  }
})

type Commands = 'cmd1' | 'cmd2'
type CommandMap = {
  cmd1: CommandMessage<
    'cmd1',
    {
      data: string
    }
  >
  cmd2: CommandMessage<
    'cmd2',
    {
      something: 'here'
    }
  >
}
type StatusMap = {
  cmd1: StatusMessage<Record<string, never>>
  cmd2: StatusMessage<{ whoa: 'there' }>
}
type IntermediateStatusMap = {
  cmd1: IntermediateStatusMessage<{
    holdUp: string
  }>
}

describe('Client', () => {
  beforeEach(() => {
    mockGenerator.mockReset()
  })
  it('constructs a sender and closes it appropriately', async () => {
    const connection = new MockConnection(1, 100)
    const client = new Client<Commands, CommandMap, StatusMap, AuthSchema<undefined, undefined>, IntermediateStatusMap>(
      {
        commands: ['cmd1', 'cmd2'],
        ackRetryDelay: 1000,
        maxAckRetries: 4,
        connection: connection,
        debug: jest.fn(),
      },
    )
    await client.open()

    let idx = 0
    mockGenerator.mockImplementation(() => {
      return `${++idx}`
    })

    const sender = await client.createSender(undefined)

    const expectedCommand: SenderCreateCommand<Record<string, never>> = {
      command: 'senderCreate',
      txn: '1',
      data: {},
    }
    const expectedStatusAck: ACKMessage = {
      ack: 'status',
      txn: '1',
      for: sender.id,
    }

    // Expect the send messages
    expect(connection.sendMessage).toHaveBeenCalledTimes(2)
    expect(connection.sendMessage).toHaveBeenCalledWith(JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenCalledWith(JSON.stringify(expectedStatusAck))

    connection.sendMessage.mockClear()

    await sender.close()
    const expectedCloseCommand: SenderCloseCommand<Record<string, never>> = {
      for: sender.id,
      command: 'senderClose',
      txn: '2',
      data: {},
    }
    const expectedCloseStatusAck: ACKMessage = {
      ack: 'status',
      txn: '2',
      for: sender.id,
    }
    expect(connection.sendMessage).toHaveBeenCalledTimes(2)
    expect(connection.sendMessage).toHaveBeenCalledWith(JSON.stringify(expectedCloseCommand))
    expect(connection.sendMessage).toHaveBeenCalledWith(JSON.stringify(expectedCloseStatusAck))
    await client.close()
  })
  it('constructs a sender and closes it appropriately with Ack delay', async () => {
    const connection = new MockConnection(3, 100)
    const client = new Client<Commands, CommandMap, StatusMap>({
      commands: ['cmd1', 'cmd2'],
      ackRetryDelay: 100,
      maxAckRetries: 4,
      connection: connection,
      debug: jest.fn(),
    })
    await client.open()

    let idx = 0
    mockGenerator.mockImplementation(() => {
      return `${++idx}`
    })

    const sender = await client.createSender(undefined)

    const expectedCommand: SenderCreateCommand<Record<string, never>> = {
      command: 'senderCreate',
      txn: '1',
      data: {},
    }
    const expectedStatusAck: ACKMessage = {
      ack: 'status',
      txn: '1',
      for: sender.id,
    }

    // Expect the send messages
    expect(connection.sendMessage).toHaveBeenCalledTimes(4)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenCalledWith(JSON.stringify(expectedStatusAck))

    connection.sendMessage.mockClear()

    await sender.close()
    const expectedCloseCommand: SenderCloseCommand<Record<string, never>> = {
      for: sender.id,
      command: 'senderClose',
      txn: '2',
      data: {},
    }
    const expectedCloseStatusAck: ACKMessage = {
      ack: 'status',
      txn: '2',
      for: sender.id,
    }
    expect(connection.sendMessage).toHaveBeenCalledTimes(4)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedCloseCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedCloseCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedCloseCommand))
    expect(connection.sendMessage).toHaveBeenCalledWith(JSON.stringify(expectedCloseStatusAck))
    await client.close()
  })
  it('throws with no sender if a nack occurs', async () => {
    const connection = new MockConnection(3, 100)
    const client = new Client<Commands, CommandMap, StatusMap>({
      commands: ['cmd1', 'cmd2'],
      ackRetryDelay: 100,
      maxAckRetries: 4,
      connection: connection,
      debug: jest.fn(),
    })
    await client.open()

    let idx = 0
    mockGenerator.mockImplementation(() => {
      return `${++idx}`
    })
    connection.handleCommandAck('senderCreate', async (): Promise<NACKMessage> => {
      return {
        nack: 'senderCreate',
        txn: '1',
        reason: 'badMessage',
      } as any
    })

    await expect(async () => {
      await client.createSender()
    }).rejects.toEqual('NACK received')

    const expectedCommand: SenderCreateCommand<Record<string, never>> = {
      command: 'senderCreate',
      txn: '1',
      data: {},
    }

    // Expect the send messages
    expect(connection.sendMessage).toHaveBeenCalledTimes(3)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedCommand))
    await client.close()
  })
  it('throws with no sender if the status is a failure', async () => {
    const connection = new MockConnection(3, 100)
    const client = new Client<Commands, CommandMap, StatusMap>({
      commands: ['cmd1', 'cmd2'],
      ackRetryDelay: 100,
      maxAckRetries: 4,
      connection: connection,
      debug: jest.fn(),
    })
    await client.open()

    let idx = 0
    mockGenerator.mockImplementation(() => {
      return `${++idx}`
    })
    connection.handleCommandAck('senderCreate', async (): Promise<ACKMessage> => {
      return {
        ack: 'senderCreate',
        txn: '1',
      } as any
    })
    connection.handleCommand('senderCreate', async (msg): Promise<SenderCreateStatusMessage> => {
      return {
        result: 'fail',
        for: msg.for,
        txn: msg.txn,
        error: {
          type: 'unexpected',
          message: 'dang son',
        },
      }
    })

    await expect(async () => {
      await client.createSender()
    }).rejects.toEqual(new Error('Failed to create Sender: [unexpected] dang son'))

    await client.close()
  })
  it('throws if ack does not show up in time', async () => {
    const connection = new MockConnection(6, 100)
    const client = new Client<Commands, CommandMap, StatusMap>({
      commands: ['cmd1', 'cmd2'],
      ackRetryDelay: 100,
      maxAckRetries: 4, // 5 total calls
      connection: connection,
      debug: jest.fn(),
    })
    await client.open()

    let idx = 0
    mockGenerator.mockImplementation(() => {
      return `${++idx}`
    })

    await expect(async () => {
      await client.createSender()
    }).rejects.toEqual('Failed to secure response in time for senderCreate')

    const expectedCommand: SenderCreateCommand<Record<string, never>> = {
      command: 'senderCreate',
      txn: '1',
      data: {},
    }

    // Expect the send messages
    expect(connection.sendMessage).toHaveBeenCalledTimes(5)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(4, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(5, JSON.stringify(expectedCommand))
    await client.close()
  })
  it('sender applies the same retry rules for ack and returns status', async () => {
    const connection = new MockConnection(2, 100)
    const client = new Client<Commands, CommandMap, StatusMap>({
      commands: ['cmd1', 'cmd2'],
      ackRetryDelay: 100,
      maxAckRetries: 4, // 5 total calls
      connection: connection,
      debug: jest.fn(),
    })
    await client.open()

    let idx = 0
    mockGenerator.mockImplementation(() => {
      return `${++idx}`
    })
    connection.handleCommand('cmd1', async (cmd): Promise<StatusMessage<Record<string, never>>> => {
      return {
        for: cmd.for,
        result: 'success',
        txn: cmd.txn,
        data: {},
      }
    })
    connection.ackForCommand('cmd1')

    const sender = await client.createSender()

    connection.sendMessage.mockClear()

    const status = await sender.command('cmd1', { data: 'something' })

    expect(status).toEqual({
      for: sender.id,
      result: 'success',
      txn: '2',
      data: {},
    })

    const expectedCommand: CommandMap['cmd1'] = {
      for: sender.id,
      command: 'cmd1',
      txn: '2',
      data: {
        data: 'something',
      },
    }
    const expectedCm1StatusAck: ACKMessage = {
      ack: 'status',
      txn: '2',
      for: sender.id,
    }

    // Expect the send messages
    expect(connection.sendMessage).toHaveBeenCalledTimes(3)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedCm1StatusAck))

    await sender.close()
    await client.close()
  })
  it('sender applies the same retry rules for ack, processes intermediate statuses, and returns status', async () => {
    const connection = new MockConnection(2, 100)
    const client = new Client<Commands, CommandMap, StatusMap, AuthSchema<undefined, undefined>, IntermediateStatusMap>(
      {
        commands: ['cmd1', 'cmd2'],
        ackRetryDelay: 100,
        maxAckRetries: 4, // 5 total calls
        connection: connection,
        debug: jest.fn(),
      },
    )
    await client.open()

    let idx = 0
    mockGenerator.mockImplementation(() => {
      return `${++idx}`
    })
    connection.handleCommand(
      'cmd1',
      async (cmd): Promise<(StatusMessage<Record<string, never>> | IntermediateStatusMessage<any>)[]> => {
        return [
          {
            for: cmd.for,
            interModifier: 'something',
            result: 'intermediate',
            txn: cmd.txn,
            data: {
              holdUp: 'son',
            },
          },
          {
            for: cmd.for,
            interModifier: 'here',
            result: 'intermediate',
            txn: cmd.txn,
            data: {
              holdUp: 'horse',
            },
          },
          {
            for: cmd.for,
            result: 'success',
            txn: cmd.txn,
            data: {},
          },
        ]
      },
    )
    connection.ackForCommand('cmd1')

    const sender = await client.createSender()

    connection.sendMessage.mockClear()

    const mockOnIntermediate = jest.fn().mockResolvedValue('value')
    const status = await sender.command('cmd1', { data: 'something' }, mockOnIntermediate)

    expect(status).toEqual({
      for: sender.id,
      result: 'success',
      txn: '2',
      data: {},
    })

    const expectedCommand: CommandMap['cmd1'] = {
      for: sender.id,
      command: 'cmd1',
      txn: '2',
      data: {
        data: 'something',
      },
    }
    const expectedIntermediateStatusAck1: ACKMessage = {
      ack: 'status',
      interModifier: 'something',
      txn: '2',
      for: sender.id,
    }
    const expectedIntermediateStatusAck2: ACKMessage = {
      ack: 'status',
      interModifier: 'here',
      txn: '2',
      for: sender.id,
    }
    const expectedCm1StatusAck: ACKMessage = {
      ack: 'status',
      txn: '2',
      for: sender.id,
    }

    // Expect the send messages and intermediates
    expect(connection.sendMessage).toHaveBeenCalledTimes(5)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedIntermediateStatusAck1))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(4, JSON.stringify(expectedIntermediateStatusAck2))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(5, JSON.stringify(expectedCm1StatusAck))

    // Expect the intermediate function to have been called
    expect(mockOnIntermediate).toHaveBeenCalledTimes(2)
    expect(mockOnIntermediate).toHaveBeenNthCalledWith(1, {
      for: sender.id,
      interModifier: 'something',
      result: 'intermediate',
      txn: '2',
      data: {
        holdUp: 'son',
      },
    })
    expect(mockOnIntermediate).toHaveBeenNthCalledWith(2, {
      for: sender.id,
      interModifier: 'here',
      result: 'intermediate',
      txn: '2',
      data: {
        holdUp: 'horse',
      },
    })

    await sender.close()
    await client.close()
  })
  it('sender processes duplicate intermediate statuses once, and returns status', async () => {
    const connection = new MockConnection(2, 100)
    const client = new Client<Commands, CommandMap, StatusMap, AuthSchema<undefined, undefined>, IntermediateStatusMap>(
      {
        commands: ['cmd1', 'cmd2'],
        ackRetryDelay: 100,
        maxAckRetries: 4, // 5 total calls
        connection: connection,
        debug: jest.fn(),
      },
    )
    await client.open()

    let idx = 0
    mockGenerator.mockImplementation(() => {
      return `${++idx}`
    })
    connection.handleCommand(
      'cmd1',
      async (cmd): Promise<(StatusMessage<Record<string, never>> | IntermediateStatusMessage<any>)[]> => {
        return [
          {
            for: cmd.for,
            interModifier: 'something',
            result: 'intermediate',
            txn: cmd.txn,
            data: {
              holdUp: 'son',
            },
          },
          {
            for: cmd.for,
            interModifier: 'something', // same modifier
            result: 'intermediate',
            txn: cmd.txn,
            data: {
              holdUp: 'horse',
            },
          },
          {
            for: cmd.for,
            result: 'success',
            txn: cmd.txn,
            data: {},
          },
        ]
      },
    )
    connection.ackForCommand('cmd1')

    const sender = await client.createSender()

    connection.sendMessage.mockClear()

    const mockOnIntermediate = jest.fn().mockResolvedValue('value')
    const status = await sender.command('cmd1', { data: 'something' }, mockOnIntermediate)

    expect(status).toEqual({
      for: sender.id,
      result: 'success',
      txn: '2',
      data: {},
    })

    const expectedCommand: CommandMap['cmd1'] = {
      for: sender.id,
      command: 'cmd1',
      txn: '2',
      data: {
        data: 'something',
      },
    }
    const expectedIntermediateStatusAck1: ACKMessage = {
      ack: 'status',
      interModifier: 'something',
      txn: '2',
      for: sender.id,
    }
    const expectedCm1StatusAck: ACKMessage = {
      ack: 'status',
      txn: '2',
      for: sender.id,
    }

    // Expect the send messages and intermediates
    expect(connection.sendMessage).toHaveBeenCalledTimes(4)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(3, JSON.stringify(expectedIntermediateStatusAck1))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(4, JSON.stringify(expectedCm1StatusAck))

    // Expect the intermediate function to have been called just once
    expect(mockOnIntermediate).toHaveBeenCalledTimes(1)
    expect(mockOnIntermediate).toHaveBeenNthCalledWith(1, {
      for: sender.id,
      interModifier: 'something',
      result: 'intermediate',
      txn: '2',
      data: {
        holdUp: 'son',
      },
    })

    await sender.close()
    await client.close()
  })
  it('sender fails for NACK', async () => {
    const connection = new MockConnection(2, 100)
    const client = new Client<Commands, CommandMap, StatusMap>({
      commands: ['cmd1', 'cmd2'],
      ackRetryDelay: 100,
      maxAckRetries: 4, // 3 total calls
      connection: connection,
      debug: jest.fn(),
    })
    await client.open()

    let idx = 0
    mockGenerator.mockImplementation(() => {
      return `${++idx}`
    })
    connection.nackForCommand('cmd1')

    const sender = await client.createSender()

    connection.sendMessage.mockClear()

    await expect(async () => await sender.command('cmd1', { data: 'something' })).rejects.toEqual('NACK received')

    const expectedCommand: CommandMap['cmd1'] = {
      for: sender.id,
      command: 'cmd1',
      txn: '2',
      data: {
        data: 'something',
      },
    }

    // Expect the send messages
    expect(connection.sendMessage).toHaveBeenCalledTimes(2)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedCommand))

    await sender.close()
    await client.close()
  })
  it('sender fails for too many returns', async () => {
    const connection = new MockConnection(1, 100)
    const client = new Client<Commands, CommandMap, StatusMap>({
      commands: ['cmd1', 'cmd2'],
      ackRetryDelay: 100,
      maxAckRetries: 2, // 3 total calls
      connection: connection,
      debug: jest.fn(),
    })
    await client.open()

    let idx = 0
    mockGenerator.mockImplementation(() => {
      return `${++idx}`
    })
    connection.nackForCommand('cmd1')

    const sender = await client.createSender()

    // Set it to wait too long for ack
    connection.numberOfMsgsBeforeAck = 4
    connection.sendMessage.mockClear()

    await expect(async () => await sender.command('cmd1', { data: 'something' })).rejects.toEqual(
      'Failed to secure response in time for cmd1',
    )

    const expectedCommand: CommandMap['cmd1'] = {
      for: sender.id,
      command: 'cmd1',
      txn: '2',
      data: {
        data: 'something',
      },
    }

    // Expect the send messages
    expect(connection.sendMessage).toHaveBeenCalledTimes(3)
    expect(connection.sendMessage).toHaveBeenNthCalledWith(1, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedCommand))
    expect(connection.sendMessage).toHaveBeenNthCalledWith(2, JSON.stringify(expectedCommand))

    connection.numberOfMsgsBeforeAck = 1

    await sender.close()
    await client.close()
  })
})
