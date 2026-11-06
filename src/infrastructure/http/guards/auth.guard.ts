import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const value = this.config.get<boolean | string>("AUTH_ENABLED");
    const authEnabled = value === true || value === "true";

    if (!authEnabled) {
      return true;
    }

    throw new UnauthorizedException("Validação JWT ainda não implementada.");
  }
}
