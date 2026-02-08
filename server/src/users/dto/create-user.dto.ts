import { IsEmail, IsNotEmpty, IsString, Length, Matches, MinLength } from "class-validator";

export class CreateUserDto {
    @IsNotEmpty()
    @IsString()
    @MinLength(4)
    username: string;

    @IsNotEmpty()
    @IsEmail()
    email: string;

    @IsNotEmpty()
    @IsString()
    @Length(6,20)
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z]).+$/, {
        message: 'password must contain at least one uppercase, one lowercase, and one non-alphabetic character',
    })
    password: string;
}
