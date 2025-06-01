import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import ethers from 'ethers';
import { Nft } from 'src/entities/Nft';
import { NftProperty } from 'src/entities/NftProperty';
import { Repository } from 'typeorm';

export interface NftAttribute {
    trait_type: string;
    value: string;
}

export interface ILazyNft {
    address: string;
    name: string;
    image: string;
    description: string;
    attributes: NftAttribute[];
}

@Injectable()
export class MintingService {
    constructor(
        @InjectRepository(Nft) private nftRepository: Repository<Nft>,
        @InjectRepository(NftProperty) private nftPropertyRepository: Repository<NftProperty>,
        private configService: ConfigService,
    ) { }

    get lazyMintingContract() {
        return this.configService.get('LAZY_MINTING_CONTRACT');
    }

    async generateNftLazy({ address, name, image, description, attributes }: ILazyNft) {
        const lastToken = await this.nftRepository.findOne({
            where: {
                creatorAddress: address,
                contractAddress: this.lazyMintingContract,
            },
            order: { tokenId: 'desc' },
        });

        let tokenIndex = 1;

        if (lastToken) {
            tokenIndex = parseInt(lastToken.tokenId.slice(40), 16) + 1;
        }

        const newToken = new Nft();
        newToken.creatorAddress = address;
        newToken.contractAddress = this.lazyMintingContract;
        newToken.name = name;
        newToken.image = image;
        newToken.description = description;
        newToken.isLazy = true;
        newToken.tokenId = ethers.zeroPadValue(
            ethers.hexlify('0x' + address), 20
        ) + ethers.zeroPadValue(
            ethers.toBeHex(tokenIndex), 12
        ).replace(/0x/g, '');
        newToken.properties = attributes.filter(
            (property) => property.trait_type && property.value
        ).map(({ trait_type, value }) => {
            const property = new NftProperty();

            property.nft = newToken;
            property.propertyKey = trait_type;
            property.value = value;

            return property;
        });

        const result = await this.nftRepository.save(newToken);
        await this.nftPropertyRepository.save(newToken.properties);

        return result;
    }
}
