import { Column, ForeignKey, Model, Table, DataType } from "sequelize-typescript";
import { Tag } from "./Tag.js";
import { Post } from "./Post.js";


@Table
export class PostTag extends Model<PostTag>{

    @ForeignKey(()=>Post)
    @Column({
        type: DataType.INTEGER, // <-- Explicitly define the type here
        allowNull: false,
    })
    PostId?: number;

    @ForeignKey(()=>Tag)
    @Column({
        type: DataType.INTEGER, // <-- Do the same for TagId if it throws a similar error
        allowNull: false,
    })
    tagId?: number;






}
