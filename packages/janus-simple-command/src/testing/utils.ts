export async function wait(time: number) {
  await new Promise<void>((res) => {
    setTimeout(() => {
      res()
    }, time)
  })
}
