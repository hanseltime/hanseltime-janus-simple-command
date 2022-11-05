async function huh() {
  new Promise((res) => {
    setTimeout(() => {
      res('')
    }, 1000)
  })
}

async function main() {
  await new Promise(async (res) => {
    await huh()
    console.log('heyo')
    res('')
  })
  console.log('woh')
}

void main()
