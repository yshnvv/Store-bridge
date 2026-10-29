import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from './config/configuration';
import { OzonModule } from './ozon/ozon.module';
import { FzrModule } from './fazercards/fazercards.module';
import { FulfillmentModule } from './fulfillment/fulfillment.module';
import { CatalogModule } from './catalog/catalog.module';
import { CatalogSyncModule } from './catalog/sync/sync.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('app.mongoUri'),
      }),
      inject: [ConfigService],
    }),
    OzonModule,
    FzrModule,
    FulfillmentModule,
    CatalogModule,
    CatalogSyncModule,
  ],
})
export class AppModule {}
