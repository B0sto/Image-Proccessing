import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { AuthGuard } from './guards/auth.guard';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  @Post('login')
  login(@Body() signInDto: SignInDto) {
    return this.authService.singIn(signInDto);
  }

  @Post('auth/sign-up')
  legacySignUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
  }

  @Post('auth/sign-in')
  legacySignIn(@Body() signInDto: SignInDto) {
    return this.authService.singIn(signInDto);
  }

  @UseGuards(AuthGuard)
  @Get('auth/current-user')
  currentUser(@Req() req) {
    const userId = req.userId;
    return this.authService.currentUser(userId);
  }
}
