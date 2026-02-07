import { BadRequestException, CanActivate, ExecutionContext, Injectable } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt";
import { Observable } from "rxjs"

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private jwtService: JwtService){}

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const req = context.switchToHttp().getRequest();
        const token = this.getToken(req.headers);

        if (!token) throw new BadRequestException();

        try {
            const payload = this.jwtService.verify(token);
            req.userId = payload.userId
        }catch (e) {
            throw new BadRequestException(e);
        }


        return req.headers;
    }


    getToken(headers) {
        if (!headers["authorization"]) return null;
        
        const [type, token] = headers["authorization"].split(" ");

        return type === "Bearer" ? token : null;
    }
}