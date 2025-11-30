import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { Uuid } from '@/common/types/common.type';
import { paginate } from '@/utils/offset-pagination';
import { Injectable } from '@nestjs/common';
import assert from 'assert';
import { plainToInstance } from 'class-transformer';
import { CreatePlayerReqDto } from './dto/create-player.req.dto';
import { ListPlayerReqDto } from './dto/list-player.req.dto';
import { PlayerResDto } from './dto/player.res.dto';
import { UpdatePlayerReqDto } from './dto/update-player.req.dto';
import { PlayerEntity } from '@goalxi/database';

@Injectable()
export class PlayerService {
    constructor() { }

    async findMany(
        reqDto: ListPlayerReqDto,
    ): Promise<OffsetPaginatedDto<PlayerResDto>> {
        const query = PlayerEntity.createQueryBuilder('player').orderBy(
            'player.createdAt',
            'DESC',
        );
        const [players, metaDto] = await paginate<PlayerEntity>(query, reqDto, {
            skipCount: false,
            takeAll: false,
        });

        return new OffsetPaginatedDto(
            players.map((player) => this.mapToResDto(player)),
            metaDto,
        );
    }

    async findOne(id: Uuid): Promise<PlayerResDto> {
        assert(id, 'id is required');
        const player = await PlayerEntity.findOneByOrFail({ id });

        return this.mapToResDto(player);
    }

    async create(reqDto: CreatePlayerReqDto): Promise<PlayerResDto> {
        const player = new PlayerEntity({
            name: reqDto.name,
            teamId: reqDto.teamId,
            birthday: reqDto.birthday,
            appearance: reqDto.appearance || this.generateRandomAppearance(),
            position: reqDto.position,
            isGoalkeeper: reqDto.isGoalkeeper,
            attributes: reqDto.attributes || {},
        });

        await player.save();

        return this.mapToResDto(player);
    }

    async update(id: Uuid, reqDto: UpdatePlayerReqDto): Promise<PlayerResDto> {
        assert(id, 'id is required');
        const player = await PlayerEntity.findOneByOrFail({ id });

        if (reqDto.name) player.name = reqDto.name;
        if (reqDto.teamId !== undefined) player.teamId = reqDto.teamId;
        if (reqDto.birthday) player.birthday = reqDto.birthday;
        if (reqDto.appearance) {
            player.appearance = {
                ...player.appearance,
                ...reqDto.appearance,
            };
        }
        if (reqDto.position) player.position = reqDto.position;
        if (reqDto.isGoalkeeper !== undefined) player.isGoalkeeper = reqDto.isGoalkeeper;
        if (reqDto.onTransfer !== undefined) player.onTransfer = reqDto.onTransfer;
        if (reqDto.attributes) {
            player.attributes = {
                ...player.attributes,
                ...reqDto.attributes,
            };
        }

        await player.save();

        return this.mapToResDto(player);
    }

    async delete(id: Uuid): Promise<void> {
        assert(id, 'id is required');
        const player = await PlayerEntity.findOneByOrFail({ id });
        await player.softRemove();
    }

    async generateRandom(count: number = 1): Promise<PlayerResDto[]> {
        const players: PlayerResDto[] = [];

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

            await player.save();
            players.push(this.mapToResDto(player));
        }

        return players;
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

    private mapToResDto(player: PlayerEntity): PlayerResDto {
        return plainToInstance(PlayerResDto, {
            id: player.id,
            teamId: player.teamId,
            name: player.name,
            birthday: player.birthday,
            appearance: player.appearance,
            position: player.position,
            isGoalkeeper: player.isGoalkeeper,
            onTransfer: player.onTransfer,
            attributes: player.attributes,
            createdAt: player.createdAt,
            updatedAt: player.updatedAt,
        });
    }
}
