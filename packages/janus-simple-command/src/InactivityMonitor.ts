export class InactivityMonitor {
  private senderHandlers = new Map<string, () => void>()
  private senderTimers = new Map<string, NodeJS.Timeout>()

  constructor(private inactivityMs: number) {}

  register(id: string, onInactive: () => void) {
    this.senderHandlers.set(id, onInactive)
    this.setInactiveTimer(id)
  }

  refresh(id: string) {
    const timer = this.senderTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.setInactiveTimer(id)
    }
  }

  unregister(id: string) {
    const timer = this.senderTimers.get(id)
    if (timer) {
      clearTimeout(timer)
    }
    this.senderTimers.delete(id)
    this.senderHandlers.delete(id)
  }

  /**
   * Close the inactivity monitor and all monitores
   */
  close() {
    this.senderTimers.forEach((timer, key) => {
      const handler = this.senderHandlers.get(key)
      this.unregister(key)
      // Call the handler to trigger any outside inactivity
      handler?.()
    })
  }

  numberActive(): number {
    return this.senderTimers.size
  }

  private setInactiveTimer(id: string) {
    this.senderTimers.set(
      id,
      setTimeout(() => {
        const handler = this.senderHandlers.get(id)
        this.senderHandlers.delete(id)
        this.senderTimers.delete(id)
        handler?.()
      }, this.inactivityMs),
    )
  }
}
