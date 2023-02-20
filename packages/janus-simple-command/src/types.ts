/**
 * This is an abstracted connection, allowing you to
 * set up an interface for whatever underlying messaging
 * framework you are using.
 */
export interface Connection {
  // Opens the connection and leaves it open
  open(): Promise<void>

  // Sends a serialized string message
  sendMessage(msg: string): Promise<void>

  // Triggered any time that a message is recieved (message should be serialized string)
  onMessage(messageHandler: (msg: string) => Promise<void>): void

  // Triggered any time that an error on the connection occurs
  onError(errorHandler: (error: Error) => Promise<void>): void

  // Triggered any time that an error on the connection occurs
  onClose(closeHandler: () => Promise<void>): void

  // Closes the connection
  close(): Promise<void>
}
