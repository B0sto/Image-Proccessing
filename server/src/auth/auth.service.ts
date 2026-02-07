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
        if (!existingUser) throw new BadGatewayException("This user already exists");

        const hashedPass = await bcrypt.hash(signUpDto.password, 10);

        await this.userService.create({ ...signUpDto, password: hashedPass })

        return "User has been created successfully";

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
        return { accessToken };


    }

    async currentUser(userId:string) {
        const user = await this.userService.findOne(userId);

        return user;
    }

}
