import { intGeneratorFactory } from '../idGenerators'
import { IntermediateStatusMessage } from '../messagesTypes'
import { BaseTxnManager, SenderTxnListener } from './BaseTxnManager'

interface SenderTxnManagerOptions {
  // A generation function for creating non-colliding ids
  idGenerator?: () => string
}

/**
 * Simple Txn Manager for tracking a Sender's transactions
 */
export class SenderTxnManager extends BaseTxnManager<SenderTxnListener> {
  static readonly MAX_DUPLICATES = 100

  private idGenerator: () => string
  private txnInterModifiers = new Map<string, Set<string>>()

  constructor(options: SenderTxnManagerOptions = {}) {
    super()
    this.idGenerator = options.idGenerator ?? intGeneratorFactory()
  }

  /**
   * Creates a transaction id that is associated with the following
   *
   * @param actions
   *      onAck() - for handling calls to ack()
   *      onNack() - for handling calls to nack()
   *      onStatus() - for handling calls to status()
   *
   * @returns a transaction string that can be used with the other methods
   * and is unique to all other non-removed/nacked transaction strings
   */
  create(actions: SenderTxnListener): string {
    let txn: string
    let retry = 0
    do {
      if (retry > SenderTxnManager.MAX_DUPLICATES) {
        throw new Error('idGenerator is not providing enough entropy.  Could not create unique id.')
      }
      txn = this.idGenerator()
      retry++
    } while (this.txnMap.has(txn))
    this.txnMap.set(txn, actions)
    this.txnInterModifiers.set(txn, new Set())
    return txn
  }

  /**
   * Triggers onStatus of the txn with the
   * message object provided
   *
   * @param txn
   * @param msg
   */
  async status(txn: string, msg: any): Promise<void> {
    // Remove the status since we only want to act once
    const listener = this.txnMap.get(txn)
    if (listener) {
      const interModifier = (msg as IntermediateStatusMessage<any>).interModifier

      if (!interModifier) {
        this.remove(txn)
      } else {
        // filter out duplicate intermediate statuses sent
        const usedModifiers = this.txnInterModifiers.get(txn)
        if (usedModifiers?.has(interModifier)) return
        usedModifiers?.add(interModifier)
      }
      await listener.onStatus(msg)
    }
  }

  remove(txn: string): boolean {
    const del = super.remove(txn)
    this.txnInterModifiers.delete(txn)
    return del
  }
}
