let locked = false
const queue: Array<() => void> = []

export async function acquireFileLock(): Promise<() => void> {
  if (!locked) {
    locked = true
    return release
  }

  return new Promise<() => void>((resolve) => {
    queue.push(() => {
      resolve(release)
    })
  })
}

function release(): void {
  const next = queue.shift()
  if (next) {
    next()
  } else {
    locked = false
  }
}
