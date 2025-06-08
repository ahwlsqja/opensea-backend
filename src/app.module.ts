import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { AuthRequest } from './entities/AuthRequest';
import { User } from './entities/User';
import { UserController } from './user/user.controller';
import { UserService } from './user/user.service';
import { MintingController } from './minting/minting.controller';
import { MintingService } from './minting/minting.service';
import { Nft } from './entities/Nft';
import { NftProperty } from './entities/NftProperty';
import { NftContract } from './entities';
import { NftController } from './nft/nft.controller';
import { NftService } from './nft/nft.service';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    HttpModule,
    ConfigModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis:{
          host: configService.get('REDIS_HOST')
        }
      }),
    }),
    BullModule.registerQueue({
      name: 'nft',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule, AuthModule],
      useFactory: (ConfigService: ConfigService) => ({
        type: 'mysql',
        host: ConfigService.get('DB_HOST'),
        port: ConfigService.get('DB_PORT'),
        username: ConfigService.get('DB_USERNAME'),
        password: ConfigService.get('DB_PASSWORD'),
        database: ConfigService.get('DB_DBNAME'),
        entities: [AuthRequest, User, Nft, NftProperty, NftContract],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([User, Nft, NftProperty, NftContract]),
    AuthModule,
  ],
  controllers: [AppController, UserController, MintingController, NftController],
  providers: [AppService, UserService, MintingService, NftService],
})
export class AppModule { }
