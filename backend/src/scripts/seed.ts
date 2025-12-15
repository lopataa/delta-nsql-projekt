import { AuthService } from '../auth/auth.service';
import { RedisService } from '../redis/redis.service';
import { TasksService } from '../tasks/tasks.service';

async function seed() {
  const redis = new RedisService();
  await redis.onModuleInit();

  const auth = new AuthService(redis);
  const tasks = new TasksService(redis);

  const email = 'student@example.com';
  const password = 'changeme123';
  const name = 'Demo Student';

  const { user } =
    (await auth
      .register({ email, password, name })
      .catch(async () => auth.login({ email, password }))) ?? {};

  if (!user) {
    throw new Error('Failed to create demo user');
  }

  const existing = await tasks.list(user.id, {});
  if (existing.length >= 10) {
    console.log('Seed data already present, skipping');
    await redis.onModuleDestroy();
    return;
  }

  const categories = ['Matematika', 'Programování', 'Biologie', 'Jazyky'];
  const titles = [
    'Dopočítat domácí úkol z derivací',
    'Vyřešit logickou úlohu',
    'Dokončit laborku s mikroskopem',
    'Nacvičit slovíčka na test',
    'Připravit se na prezentaci',
    'Dopsat semestrální projekt',
    'Nahrát kód na GitHub',
    'Procvičit integrály',
    'Přečíst kapitolu o datových strukturách',
    'Opravit chyby v kódu',
  ];

  for (let i = 0; i < 10; i++) {
    await tasks.create(user.id, {
      title: titles[i],
      description: `Ukázkový úkol #${i + 1}`,
      category: categories[i % categories.length],
    });
  }

  console.log('Seeded demo user and 10 tasks.');
  await redis.onModuleDestroy();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
