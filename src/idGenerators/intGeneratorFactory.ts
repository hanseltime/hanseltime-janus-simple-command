const MAX_INT_NUMBER = 1000000000
export function intGeneratorFactory(): () => string {
  let idx = 0
  return () => {
    idx++
    if (idx > MAX_INT_NUMBER) {
      idx = 1
    }
    return `${idx}`
  }
}
