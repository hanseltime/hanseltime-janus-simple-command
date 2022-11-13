import { ACKMessage, CommandMessage, NACKMessage, StatusMessage } from './messagesTypes'
import { tryToGetMessageObject, messageIsForServer, messageIsForClient } from './utils'

describe('tryToGetMessageObject', () => {
  it('returns JSON with valid JSON', () => {
    expect(tryToGetMessageObject('{ "something": 12 }')).toEqual({
      something: 12,
    })
  })
  it('returns null for invalid JSON', () => {
    expect(tryToGetMessageObject('PING')).toBeNull()
  })
})

const ackForServer: ACKMessage = {
  ack: 'status',
  txn: '22',
  for: 'sender',
}
const nackForServer: NACKMessage = {
  nack: 'status',
  txn: '22',
  for: 'sender',
  reason: 'badMessage',
}
const ackForClient: ACKMessage = {
  ack: 'someCommand',
  txn: '22',
  for: 'sender',
}
const nackForClient: NACKMessage = {
  nack: 'someCommand',
  txn: '22',
  for: 'sender',
  reason: 'badMessage',
}
const commandForServer: CommandMessage<any, any> = {
  command: 'something',
  for: 'sender',
  txn: '22',
  data: {},
}
const statusForClient: StatusMessage<any, any> = {
  result: 'success',
  for: 'sender',
  txn: '22',
  data: {},
}

describe('messageIsForServer', () => {
  it('approves acks for server', () => {
    expect(messageIsForServer(ackForServer)).toBe(true)
  })
  it('approves nacks for server', () => {
    expect(messageIsForServer(nackForServer)).toBe(true)
  })
  it('approves command messages for server', () => {
    expect(messageIsForServer(commandForServer)).toBe(true)
  })
  it('disapproves acks for client', () => {
    expect(messageIsForServer(ackForClient)).toBe(false)
  })
  it('disapproves nacks for client', () => {
    expect(messageIsForServer(nackForClient)).toBe(false)
  })
  it('disapproves status messages', () => {
    expect(messageIsForServer(statusForClient)).toBe(false)
  })
})

describe('messageIsForClient', () => {
  it('disapproves acks for server', () => {
    expect(messageIsForClient(ackForServer)).toBe(false)
  })
  it('disapproves nacks for server', () => {
    expect(messageIsForClient(nackForServer)).toBe(false)
  })
  it('disapproves command messages for server', () => {
    expect(messageIsForClient(commandForServer)).toBe(false)
  })
  it('approves acks for client', () => {
    expect(messageIsForClient(ackForClient)).toBe(true)
  })
  it('approves nacks for client', () => {
    expect(messageIsForClient(nackForClient)).toBe(true)
  })
  it('approves status messages', () => {
    expect(messageIsForClient(statusForClient)).toBe(true)
  })
})
