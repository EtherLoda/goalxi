import { PlayerEntity } from '@goalxi/database';
import { DataSource } from 'typeorm';
import { Seeder } from 'typeorm-extension';

export class GeneratePlayersSeeder implements Seeder {
    track = false;

    public async run(dataSource: DataSource): Promise<any> {
        const repository = dataSource.getRepository(PlayerEntity);

        const firstNames = [
            'Marcus', 'Leo', 'Diego', 'Carlos', 'Andre', 'Paulo', 'Roberto',
            'Fernando', 'Luis', 'Miguel', 'Rafael', 'Gabriel', 'Juan', 'Pedro',
            'Antonio', 'Manuel', 'Jose', 'David', 'Daniel', 'Alex',
        ];

        const lastNames = [
            'Silva', 'Santos', 'Rodriguez', 'Martinez', 'Garcia', 'Lopez',
            'Gonzalez', 'Perez', 'Sanchez', 'Ramirez', 'Torres', 'Flores',
            'Rivera', 'Gomez', 'Diaz', 'Cruz', 'Morales', 'Reyes', 'Ortiz', 'Gutierrez',
        ];

        const count = 20; // Generate 20 random players

        for (let i = 0; i < count; i++) {
            const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
            const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            const isGoalkeeper = Math.random() < 0.1; // 10% chance to be a GK

            const player = new PlayerEntity({
                name: `${firstName} ${lastName}`,
                isGoalkeeper,
                appearance: this.generateRandomAppearance(),
                attributes: this.generateRandomAttributes(isGoalkeeper),
            });

            await repository.save(player);
        }

        console.log(`Generated ${count} random players`);
    }

    private generateRandomAppearance(): Record<string, any> {
        const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

        return {
            skinTone: randInt(1, 6),
            hairStyle: randInt(1, 10),
            hairColor: randInt(1, 8),
            facialHair: randInt(0, 5),
            accessories: {
                headband: Math.random() < 0.15,
                wristband: Math.random() < 0.3,
                captainBand: Math.random() < 0.05,
            },
        };
    }

    private generateRandomAttributes(isGoalkeeper: boolean): Record<string, any> {
        const rand = (min: number, max: number) => Number((Math.random() * (max - min) + min).toFixed(2));

        if (isGoalkeeper) {
            return {
                physical: {
                    pace: rand(5, 15),
                    strength: rand(10, 18),
                    stamina: rand(10, 18),
                },
                technical: {
                    reflexes: rand(10, 20),
                    handling: rand(10, 20),
                    distribution: rand(5, 18),
                },
                mental: {
                    vision: rand(5, 15),
                    positioning: rand(10, 20),
                    awareness: rand(10, 20),
                    composure: rand(10, 20),
                    aggression: rand(5, 15),
                },
            };
        }

        return {
            physical: {
                pace: rand(10, 20),
                strength: rand(5, 20),
                stamina: rand(10, 20),
            },
            technical: {
                finishing: rand(5, 20),
                passing: rand(5, 20),
                dribbling: rand(5, 20),
                defending: rand(5, 20),
            },
            mental: {
                vision: rand(5, 20),
                positioning: rand(5, 20),
                awareness: rand(5, 20),
                composure: rand(5, 20),
                aggression: rand(5, 20),
            },
        };
    }
}
