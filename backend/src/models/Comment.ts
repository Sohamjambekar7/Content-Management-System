import { BelongsTo, Column, ForeignKey, Model, Table, DataType } from "sequelize-typescript";
import { User } from "./User";
import { Post } from "./Post";

@Table
export class Comment extends Model<Comment> {

    @Column({
        type: DataType.TEXT,
        allowNull: false
    })
    content?: string;

    @ForeignKey(() => User)
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    userId?: number;

    @ForeignKey(() => Post)
    @Column({
        type: DataType.INTEGER, // <--- Added missing type definition here
        allowNull: false
    })
    postId?: number;
    

    @BelongsTo(() => Post)
    post?: Post;

    @BelongsTo(() => User)
    user?: User;
}