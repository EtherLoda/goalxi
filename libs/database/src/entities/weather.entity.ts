import { AbstractEntity } from './abstract.entity';
import {
    Column,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';

export enum WeatherType {
    SUNNY = 'sunny',
    CLOUDY = 'cloudy',
    RAINY = 'rainy',
    HEAVY_RAIN = 'heavy_rain',
    WINDY = 'windy',
    FOGGY = 'foggy',
    SNOWY = 'snowy',
}

export interface WeatherForecast {
    weather: WeatherType;
    probability: number; // 0-100
}

@Entity('weather')
@Index(['date', 'locationId'], { unique: true })
export class WeatherEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'date', type: 'date' })
    date!: string; // YYYY-MM-DD format

    @Column({ name: 'location_id', type: 'varchar', length: 50, default: 'default' })
    locationId!: string;

    @Column({ name: 'actual_weather', type: 'varchar', length: 20 })
    actualWeather!: WeatherType;

    @Column({ name: 'forecasts', type: 'jsonb', nullable: true })
    forecasts?: WeatherForecast[]; // Tomorrow's forecasts (2-3 options)

    @Column({ name: 'tomorrow_weather', type: 'varchar', length: 20, nullable: true })
    tomorrowWeather?: WeatherType; // Actual tomorrow weather (filled next day)

    constructor(partial?: Partial<WeatherEntity>) {
        super();
        Object.assign(this, partial);
    }
}
