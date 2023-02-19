import { intGeneratorFactory } from './intGeneratorFactory'

describe('intGeneratorFactory', () => {
  it('generates a factory that increments indexes from', () => {
    const generator = intGeneratorFactory()
    expect(generator()).toBe('1')
    expect(generator()).toBe('2')
  })
})
