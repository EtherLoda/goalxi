import { AppDataSource } from '../src/database/data-source';
import { UserEntity } from '../src/api/user/entities/user.entity';
import { hashPassword } from '../src/utils/password.util';
import { SYSTEM_USER_ID } from '../src/constants/app.constant';

async function createTestUser() {
    try {
        await AppDataSource.initialize();
        console.log('Database connected');

        const userRepository = AppDataSource.getRepository(UserEntity);
        const existingUser = await userRepository.findOneBy({ email: 'test@minifc.com' });

        if (existingUser) {
            console.log('Test user already exists');
            return;
        }

        const hashedPassword = await hashPassword('123456');

        const user = new UserEntity({
            username: 'testuser',
            email: 'test@minifc.com',
            password: hashedPassword,
            nickname: 'Test Manager',
            bio: 'I am a test manager ready to win the league!',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=testuser',
            supporterLevel: 1,
        });

        // Manually set password to hashed version because @BeforeInsert might re-hash if not careful, 
        // but in UserEntity it checks if password is set. 
        // Actually UserEntity.hashPassword() hashes it if it's plain text.
        // Let's pass plain text and let the entity handle it?
        // UserEntity:
        // async hashPassword() {
        //   if (this.password) {
        //     this.password = await hashPass(this.password);
        //   }
        // }
        // It doesn't check if it's already hashed. So if I pass hashed, it will double hash.
        // So I should pass plain text '123456'.

        user.password = '123456';

        await userRepository.save(user);
        console.log('Test user created successfully: test@minifc.com / 123456');

    } catch (error) {
        console.error('Error creating test user:', error);
    } finally {
        await AppDataSource.destroy();
    }
}

createTestUser();
