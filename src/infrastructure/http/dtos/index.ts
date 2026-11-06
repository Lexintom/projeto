import {
  IsUUID,
  IsString,
  IsOptional,
  ValidateNested,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsDefined,
  Matches,
  MaxLength,
  IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";
import { WagerTransactionKind } from "../../../domain/transaction/wager-transaction.enums";

export class MoneyPropsDto {
  @Matches(/^\d{1,17}(\.\d{1,2})?$/)
  amount!: string;

  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;
}

export class CreateWalletDto {
  @IsUUID()
  playerId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => MoneyPropsDto)
  initialBalance!: MoneyPropsDto;
}

export class SubmitTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  providerId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  externalTransactionId!: string;

  @IsUUID()
  playerId!: string;

  @IsUUID()
  walletId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  roundId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  gameId!: string;

  @IsEnum(WagerTransactionKind)
  kind!: WagerTransactionKind;

  @IsDefined()
  @ValidateNested()
  @Type(() => MoneyPropsDto)
  money!: MoneyPropsDto;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  referenceExternalTransactionId?: string;
}

export class LedgerQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Max(200)
  @Min(1)
  limit?: number = 50;
}
