import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schema/user.schema';
import { Model } from 'mongoose'

@Injectable()
export class UsersService {
  constructor(@InjectModel("user") private userModel:Model<User>) {}

  async create(createUserDto: CreateUserDto) {
    const createUser = await this.userModel.create(createUserDto)
    return createUser;
  }

  findAll() {
    return this.userModel.find();
  }

  async findByEmail(email:string) {
    const foundUser = await this.userModel.findOne({ email }).select("+password");
    return foundUser
  }

  async findByUsername(username:string) {
    const foundUser = await this.userModel.findOne({ username }).select("+password");
    return foundUser;
  }

  async findOne(id: string) {
    const findUserById = await this.userModel.findById(id);

    return findUserById
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const updatedUser = await this.userModel.findByIdAndUpdate(id, updateUserDto, { new: true })
    return updatedUser;
  }

  async remove(id: string) {
    const deletedUser = await this.userModel.findByIdAndDelete(id);
    return deletedUser;
  }
}
 