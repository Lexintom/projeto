import {
  Injectable,
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from "@nestjs/common";

@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<string, string> {
  transform(value: string, metadata?: ArgumentMetadata): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new BadRequestException("Idempotency-Key header is required");
    }
    if (value.length > 300) {
      throw new BadRequestException(
        "Idempotency-Key too long (max 300 characters)",
      );
    }
    return value;
  }
}
