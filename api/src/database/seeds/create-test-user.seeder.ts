import { UserEntity } from '@/api/user/entities/user.entity';
import { SYSTEM_USER_ID } from '@/constants/app.constant';
import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';

export class CreateTestUserSeeder implements Seeder {
    track = false;

    public async run(dataSource: DataSource): Promise<any> {
        const repository = dataSource.getRepository(UserEntity);

        const testUser = await repository.findOneBy({ email: 'test@minifc.com' });
        if (!testUser) {
            await repository.insert(
                new UserEntity({
                    username: 'testuser',
                    email: 'test@minifc.com',
                    password: '123456',
                    nickname: 'Test Manager',
                    bio: 'I am a test manager ready to win the league!',
                    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=testuser',
                    supporterLevel: 1,
                }),
            );
            console.log('Test user created: test@minifc.com / 123456');
        }
    }
}
