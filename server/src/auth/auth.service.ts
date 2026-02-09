import { BadGatewayException, Injectable } from '@nestjs/common';
import { SignUpDto } from './dto/sign-up.dto';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcrypt';
import { SignInDto } from './dto/sign-in.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
    constructor(private userService: UsersService, private jwtService:JwtService) { }

    async signUp(signUpDto: SignUpDto) {
        const existingUser = await this.userService.findByEmail(signUpDto.email);
        const existingUsername = await this.userService.findByUsername(signUpDto.username);
        if (existingUser || existingUsername) throw new BadGatewayException("This user already exists");

        const hashedPass = await bcrypt.hash(signUpDto.password, 10);

        const createdUser = await this.userService.create({ ...signUpDto, password: hashedPass });
        return this.buildAuthResponse(createdUser);

    }

    async singIn(signInDto: SignInDto) {
        const existingUser = await this.userService.findByUsername(signInDto.username);
        if (!existingUser) throw new BadGatewayException("Invalid Creditials");

        const isPassEqual = await bcrypt.compare(signInDto.password, existingUser.password);
        if (!isPassEqual) throw new BadGatewayException("Invalid Creditials");

        const payload = {
            userId: existingUser._id,
            
        }

        const accessToken = await this.jwtService.sign(payload, { expiresIn: "1h" });
        return {
            user: this.serializeUser(existingUser),
            accessToken,
        };


    }

    async currentUser(userId:string) {
        const user = await this.userService.findOne(userId);

        return user;
    }

    private async buildAuthResponse(user: any) {
        const payload = {
            userId: user._id,
        };

        const accessToken = await this.jwtService.sign(payload, { expiresIn: "1h" });
        return {
            user: this.serializeUser(user),
            accessToken,
        };
    }

    private serializeUser(user: any) {
        const serialized = user?.toObject ? user.toObject() : { ...user };
        if (serialized?.password) {
            delete serialized.password;
        }

        return serialized;
    }

}
