import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { NftProperty } from "./NftProperty";

@Entity()
export class Nft {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    creatorAddress: string;

    @Column()
    contractAddress: string;

    @Column()
    tokenId: string;

    @Column()
    isLazy: boolean;

    @Column()
    name: string;

    @Column()
    description: string;

    @Column()
    image: string;

    @OneToMany(
        (type) => NftProperty,
        (nftProperty) => nftProperty.nft
    )
    properties: NftProperty[];
}