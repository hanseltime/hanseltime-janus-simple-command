import { NodeWebSocketConnection } from './NodeWebSocketConnection'
import { WebSocket, WebSocketServer, Server } from 'ws'
import { wait } from './testing/utils'
import { Client } from './Client'
import { connect } from 'http2'

const getServer = async (cb?: (connection: NodeWebSocketConnection) => Promise<void>) => {
  return new Promise<Server<WebSocket>>((res, rej) => {
    const wss = new WebSocketServer({
      port: 3000,
    })
    wss.on('connection', async (ws) => {
      const connection = new NodeWebSocketConnection(ws, 'server')
      if (cb) {
        await cb(connection)
      }
    })
    res(wss)
  })
}

describe('NodeWebSocketConnection message tests', () => {
  let server: Server<WebSocket>
  let connection: NodeWebSocketConnection
  let client: NodeWebSocketConnection

  console.log = jest.fn((...args) => {
    console.info(...args)
  })
  beforeAll(async () => {
    server = await getServer(async (c) => {
      connection = c
    })
  })
  afterAll(async () => {
    server.close()
    client.close()
  })
  it('init client', async () => {
    client = new NodeWebSocketConnection(new WebSocket('ws://localhost:3000'), 'client')
    await client.open()
    //@ts-ignore
    expect(client.cancelConnect).toBe(undefined)
    //@ts-ignore
    expect(client.type).toBe('client')
    //@ts-ignore
    expect(client.messageHandler).toBe(undefined)
  })
  it('sending empty ack message from client', async () => {
    const message = '{"ack": "ack"}'
    await client.sendMessage(message)
    await wait(100)
    connection.onMessage(async (x) => {
      expect(x).toEqual(message)
    })
  })
  it('sending empty ack message from connection', async () => {
    const message = '{"ack": "ack"}'
    await connection.sendMessage(message)
    await wait(100)
    client.onMessage(async (x) => {
      expect(x).toEqual(message)
    })
  })
  it('sending empty ack message from client', async () => {
    const message = '{"ack": "ack"}'
    await client.sendMessage(message)
    await wait(100)
    connection.onMessage(async (x) => {
      expect(x).toEqual(message)
    })
  })
  it('message does not apply to client', async () => {
    const message = '{"ack": "status", "result": null}'
    await connection.sendMessage(message)
    await wait(1000)
    expect(console.log).toBeCalledWith('message does not apply to connection')
  })
  it('message does not apply to server', async () => {
    const message = '{"ack": "not-status", "result": null}'
    await client.sendMessage(message)
    await wait(1000)
    expect(console.log).toBeCalledWith('message does not apply to connection')
  })
  it('message should add to queue and be 1', async () => {
    const message = '{"ack": "ack"}'
    connection.sendMessage(message)
    client.onMessage(async ()=> {
      await wait(1000)
    })
    await wait(100)
    //@ts-ignore
    expect(client.pending.size).toEqual(1)
  })
  it('messages added to queue and be 3', async () => {
    await wait(2000)
    const message = '{"ack": "ack"}'
    connection.sendMessage(message)
    connection.sendMessage(message)
    connection.sendMessage(message)
    client.onMessage(async ()=> {
      await wait(200)
    })
    await wait(100)
    //@ts-ignore
    expect(client.pending.size).toEqual(3)
  })
})
