import { Column, DataType, Default, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from './User';

export type YouTubeAccountStatus = 'connected' | 'mismatch' | 'expired' | 'revoked';

@Table({ tableName: 'youtube_accounts', timestamps: true, underscored: true })
export class YouTubeAccount extends Model<YouTubeAccount> {
  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false, unique: true })
  userId!: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  userEmail!: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  googleEmail?: string | null;

  @Column({ type: DataType.STRING(128), allowNull: true })
  channelId?: string | null;

  @Column({ type: DataType.STRING(255), allowNull: true })
  channelTitle?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  accessTokenEnc?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  refreshTokenEnc?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  scope?: string | null;

  @Column({ type: DataType.STRING(64), allowNull: true })
  tokenType?: string | null;

  @Column({ type: DataType.BIGINT, allowNull: true })
  expiryDate?: number | null;

  @Default('connected')
  @Column({
    type: DataType.ENUM('connected', 'mismatch', 'expired', 'revoked'),
    allowNull: false,
  })
  status!: YouTubeAccountStatus;
}
