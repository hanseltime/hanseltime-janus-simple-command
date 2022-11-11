import { CommandMessage, StatusMessage, SuccessStatusMessage } from './messagesTypes'
import { wait } from './testing/utils'
import { Sender } from './Sender'

type Commands = 'cmd1' | 'cmd2'
type CommandMap = {
  cmd1: CommandMessage<
    'cmd1',
    {
      value: string
    }
  >
  cmd2: CommandMessage<
    'cmd2',
    {
      value: 'onlyThis'
      was: boolean
    }
  >
}
type StatusMap = {
  cmd1: StatusMessage<{
    return: string
  }>
  cmd2: StatusMessage<{
    wasnot: boolean
  }>
}

const mockReturn = { mockValue: false }
const mockSendFcn = jest.fn().mockImplementation(async () => {
  return mockReturn
})

describe('Sender', () => {
  beforeEach(() => {
    mockSendFcn.mockClear()
  })
  it('does not allow sending after inactivity', async () => {
    const sender = new Sender<Commands, CommandMap, StatusMap>('senderId', mockSendFcn, 100, {})
    await wait(100)
    await expect(
      async () =>
        await sender.command('cmd1', {
          value: 'something',
        }),
    ).rejects.toThrow('Sender did not make a call within 100ms.  Cannot send again')
    expect(mockSendFcn).not.toHaveBeenCalled()
  })
  it('does sends the correct payload on close', async () => {
    const sender = new Sender<Commands, CommandMap, StatusMap>('senderId', mockSendFcn, 200, { somefield: 'f' })
    await sender.close()
    expect(mockSendFcn).toHaveBeenCalledWith('senderClose', { auth: { somefield: 'f' } }, 'senderId')
  })
  it('does not allow sending after close', async () => {
    const sender = new Sender<Commands, CommandMap, StatusMap>('senderId', mockSendFcn, 2000, {})
    await sender.close()
    mockSendFcn.mockClear()
    await expect(
      async () =>
        await sender.command('cmd1', {
          value: 'something',
        }),
    ).rejects.toThrow('Sender already had closed call.  Cannot send again')
    expect(mockSendFcn).not.toHaveBeenCalled()
  })
})
