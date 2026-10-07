import { AllowNull, Column, ForeignKey, Model, Table, BelongsTo, DataType } from "sequelize-typescript";
import { User } from "./User.js";
import { Post } from "./Post.js";

@Table
export class Comment extends Model<Comment> {

    @Column({
        type: DataType.STRING, // Explicitly define the type here
        allowNull: false
    })
    content!: string; // Removed the '= '' initializer

    @ForeignKey(() => User)
    @Column({
        type: DataType.INTEGER, // Best practice to explicitly define foreign key types too
        allowNull: false
    })
    userId?: number;

    @ForeignKey(() => Post)
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    postId?: number;

    @BelongsTo(() => Post)
    post?: Post;

    @BelongsTo(() => User)
    user?: User;
}