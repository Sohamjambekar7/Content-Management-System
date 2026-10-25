import { Table, Model, Column, ForeignKey, BelongsTo, DataType } from "sequelize-typescript";
import { User } from "./User";


@Table
export class Token extends Model<Token>{

    @Column({
        type: DataType.STRING, 
        allowNull: false
    })
    token?: string;


    @Column({
        type: DataType.ENUM('activation', 'reset', 'access', 'refresh'),
        allowNull: false
    })
    type?: 'activation' | 'reset' | 'access' | 'refresh';


    @ForeignKey(()=>User)
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    userId?: number;
    

    @BelongsTo(()=>User)
    user?: User;

    
}