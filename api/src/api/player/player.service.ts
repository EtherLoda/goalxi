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
import { PlayerEntity, PotentialTier, TrainingSlot, PlayerSkills } from '@goalxi/database';

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
        const [currentSkills, potentialSkills] = this.generateRandomSkills(reqDto.isGoalkeeper || false);
        const player = new PlayerEntity({
            name: reqDto.name,
            teamId: reqDto.teamId,
            birthday: reqDto.birthday,
            appearance: reqDto.appearance || this.generateRandomAppearance(),
            isGoalkeeper: reqDto.isGoalkeeper,
            currentSkills,
            potentialSkills,
            potentialAbility: reqDto.potentialAbility,
            potentialTier: reqDto.potentialTier,
            trainingSlot: reqDto.trainingSlot,
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
        if (reqDto.isGoalkeeper !== undefined) player.isGoalkeeper = reqDto.isGoalkeeper;
        if (reqDto.onTransfer !== undefined) player.onTransfer = reqDto.onTransfer;
        if (reqDto.potentialAbility !== undefined) player.potentialAbility = reqDto.potentialAbility;
        if (reqDto.potentialTier) player.potentialTier = reqDto.potentialTier;
        if (reqDto.trainingSlot) player.trainingSlot = reqDto.trainingSlot;

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

            const [currentSkills, potentialSkills] = this.generateRandomSkills(isGoalkeeper);
            const player = new PlayerEntity({
                name: `${firstName} ${lastName}`,
                isGoalkeeper,
                appearance: this.generateRandomAppearance(),
                currentSkills,
                potentialSkills,
            });

            await player.save();
            players.push(this.mapToResDto(player));
        }

        return players;
    }

    private generateRandomSkills(isGoalkeeper: boolean): [PlayerSkills, PlayerSkills] {
        const rand = (min: number, max: number) => Number((Math.random() * (max - min) + min).toFixed(2));

        // Helper to create attribute sets for each category
        const createPhysical = () => ({
            pace: rand(isGoalkeeper ? 5 : 10, 20),
            strength: rand(5, 20),
        });

        const createTechnicalGK = () => ({
            reflexes: rand(10, 20),
            handling: rand(10, 20),
            distribution: rand(5, 18),
        });

        const createTechnicalOutfield = () => ({
            finishing: rand(5, 20),
            passing: rand(5, 20),
            dribbling: rand(5, 20),
            defending: rand(5, 20),
        });

        const createMental = () => ({
            vision: rand(5, 20),
            positioning: rand(5, 20),
            awareness: rand(5, 20),
            composure: rand(5, 20),
            aggression: rand(5, 20),
        });

        const currentPhysical = createPhysical();
        const currentTechnical = isGoalkeeper ? createTechnicalGK() : createTechnicalOutfield();
        const currentMental = createMental();

        // Potential values start as a copy of current then possibly increase
        const potentialPhysical = { ...currentPhysical };
        const potentialTechnical = { ...currentTechnical };
        const potentialMental = { ...currentMental };

        // Randomly increase potential values
        (Object.keys(potentialPhysical) as Array<keyof typeof potentialPhysical>).forEach(key => {
            potentialPhysical[key] = Math.max(potentialPhysical[key], currentPhysical[key] + rand(0, 5));
        });

        const pTech = potentialTechnical as Record<string, number>;
        const cTech = currentTechnical as Record<string, number>;
        Object.keys(pTech).forEach(key => {
            pTech[key] = Math.max(pTech[key], cTech[key] + rand(0, 5));
        });

        (Object.keys(potentialMental) as Array<keyof typeof potentialMental>).forEach(key => {
            potentialMental[key] = Math.max(potentialMental[key], currentMental[key] + rand(0, 5));
        });

        const currentSkills: PlayerSkills = {
            physical: currentPhysical,
            technical: currentTechnical,
            mental: currentMental,
        };

        const potentialSkills: PlayerSkills = {
            physical: potentialPhysical,
            technical: potentialTechnical,
            mental: potentialMental,
        };

        return [currentSkills, potentialSkills];
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
            isYouth: player.isYouth,
            age: player.age,
            appearance: player.appearance,
            isGoalkeeper: player.isGoalkeeper,
            onTransfer: player.onTransfer,
            currentSkills: player.currentSkills,
            potentialSkills: player.potentialSkills,
            potentialAbility: player.potentialAbility,
            potentialTier: player.potentialTier,
            trainingSlot: player.trainingSlot,
            experience: player.experience,
            form: player.form,
            stamina: player.stamina,
            createdAt: player.createdAt,
            updatedAt: player.updatedAt,
        });
    }
}
