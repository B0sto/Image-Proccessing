import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ timestamps: true })
export class User {
    @Prop({ type: String })
    username: string

    @Prop({ type: String })
    email: string

    @Prop({ type: String, select: false })
    password: string
}

export const userSchema = SchemaFactory.createForClass(User);
