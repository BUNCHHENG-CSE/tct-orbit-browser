import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // 1. Ensure default User exists
  let user = await prisma.user.findFirst()
  if (!user) {
    user = await prisma.user.create({
      data: {}
    })
    console.log('Created default user:', user.id)
  } else {
    console.log('Found existing user:', user.id)
  }

  // 2. Ensure Settings exist for this user
  let settings = await prisma.settings.findUnique({
    where: { userId: user.id }
  })
  if (!settings) {
    settings = await prisma.settings.create({
      data: {
        userId: user.id,
        defaultSearchEngine: 'duckduckgo',
        theme: 'dark',
        sidebarCollapsed: false
      }
    })
    console.log('Created default settings for user')
  } else {
    console.log('Found existing settings')
  }

  // 3. Ensure "Personal" Space exists and is active
  let space = await prisma.space.findFirst({
    where: {
      userId: user.id,
      name: 'Personal'
    }
  })

  if (!space) {
    space = await prisma.space.create({
      data: {
        userId: user.id,
        name: 'Personal',
        color: '#6366f1',
        icon: 'Layers',
        order: 0,
        isActive: true
      }
    })
    console.log('Created Personal space:', space.id)
  } else {
    if (!space.isActive) {
      await prisma.space.update({
        where: { id: space.id },
        data: { isActive: true }
      })
    }
    console.log('Found existing Personal space:', space.id)
  }

  // 4. Ensure one Tab exists in Personal space pointing to DuckDuckGo
  const existingTab = await prisma.tab.findFirst({
    where: { spaceId: space.id }
  })

  if (!existingTab) {
    const tab = await prisma.tab.create({
      data: {
        spaceId: space.id,
        url: 'https://duckduckgo.com',
        title: 'DuckDuckGo — Privacy, simplified.',
        favicon: 'https://duckduckgo.com/favicon.ico',
        isPinned: false,
        order: 0
      }
    })
    console.log('Created default tab:', tab.id, tab.url)
  } else {
    console.log('Found existing tab in Personal space:', existingTab.id, existingTab.url)
  }

  console.log('Database seeding complete.')
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
