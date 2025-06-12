import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { proxyRegistryAbi, exchangeAbi, erc721Abi, erc20Abi } from './order.abi'
import { OrderSig, SolidityOrder } from './order.dto';
import { Order } from 'src/entities';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { BigNumber } from 'alchemy-sdk';

@Injectable()
export class OrderService {
    private readonly alchemyKey: string;

    // v6: providers 네임스페이스 제거
    private readonly provider: ethers.AlchemyProvider;
    private readonly proxyRegistryContract: ethers.Contract;

    private readonly exchangeAddress: string;
    private readonly exchangeContract: ethers.Contract;

    private readonly wethContractAddress: string;

    constructor(
        configService: ConfigService,
        @InjectRepository(Order) private orderRepository: Repository<Order>
    ) {
        this.alchemyKey = configService.get('ALCHEMY_KEY');
        const network = configService.get('ALCHEMY_NETWORK');

        // v6: new ethers.AlchemyProvider
        this.provider = new ethers.AlchemyProvider(
            network,
            this.alchemyKey,
        );

        this.proxyRegistryContract = new ethers.Contract(
            configService.get('PROXY_REGISTRY_CONTRACT_ADDRESS'),
            proxyRegistryAbi,
            this.provider // v6에서는 provider 연결 권장
        );

        this.exchangeAddress = configService.get('EXCHANGE_CONTRACT_ADDRESS');
        this.exchangeContract = new ethers.Contract(
            this.exchangeAddress,
            exchangeAbi,
            this.provider // v6에서는 provider 연결 권장
        );

        this.wethContractAddress = configService.get('WETH_CONTRACT_ADDRESS')
    }

    async generateSellOrder({
        maker,
        contract,
        tokenId,
        price,
        expirationTime,
    }) {
        const solidityOrder = {
            exchange: this.exchangeAddress,
            maker: maker,
            taker: '0x0000000000000000000000000000000000000000',
            saleSide: 1,
            saleKind: 0,
            target: contract,
            paymentToken: '0x0000000000000000000000000000000000000000',
            calldata_: [
                '0x42842e0e', 
                // v6: ethers.zeroPadValue 사용
                ethers.zeroPadValue(maker, 32).replace('0x', ''),
                ethers.zeroPadValue('0x00', 32).replace('0x', ''),
                this.toUint256(tokenId),
            ].join(''),
            replacementPattern: [
                '00000000', 
                '0000000000000000000000000000000000000000000000000000000000000000',
                'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
                '0000000000000000000000000000000000000000000000000000000000000000'
            ].join(''),
            staticTarget: '0x0000000000000000000000000000000000000000',
            staticExtra: '0x',
            // v6: ethers.toBeHex 사용
            basePrice: ethers.toBeHex(BigInt(price)),
            endPrice: ethers.toBeHex(BigInt(price)),
            listingTime: 0,
            expirationTime,
            // v6: ethers.randomBytes와 ethers.zeroPadValue 사용
            salt: ethers.zeroPadValue(ethers.hexlify(ethers.randomBytes(32)), 32),
        } as SolidityOrder;

        const order = new Order();
        order.raw = JSON.stringify(solidityOrder);
        order.maker = solidityOrder.maker;
        order.contractAddress = contract;
        order.tokenId = this.toUint256(tokenId);
        order.price = this.toUint256(price);
        order.expirationTime = expirationTime;
        order.isSell = true;
        order.verified = false;

        return await this.orderRepository.save(order)
    }

    async generateOfferOrder({
        maker,
        contract,
        tokenId,
        price,
        expirationTime,
    }) {
        const solidityOrder = {
            exchange: this.exchangeAddress,
            maker: maker,
            taker: '0x0000000000000000000000000000000000000000',
            saleSide: 0,
            saleKind: 0,
            target: contract,
            paymentToken: this.wethContractAddress,
            calldata_: [
                '0x42842e0e', 
                // v6: ethers.zeroPadValue 사용
                ethers.zeroPadValue(maker, 32).replace('0x', ''),
                ethers.zeroPadValue('0x00', 32).replace('0x', ''),
                this.toUint256(tokenId).replace('0x', ''),
            ].join(''),
            replacementPattern: [
                '00000000', 
                'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
                '0000000000000000000000000000000000000000000000000000000000000000',
                '0000000000000000000000000000000000000000000000000000000000000000'
            ].join(''),
            staticTarget: '0x0000000000000000000000000000000000000000',
            staticExtra: '0x',
            // v6: ethers.toBeHex 사용
            basePrice: ethers.toBeHex(BigInt(price)),
            endPrice: ethers.toBeHex(BigInt(price)),
            listingTime: 0,
            expirationTime,
            // v6: ethers.randomBytes와 ethers.zeroPadValue 사용
            salt: ethers.zeroPadValue(ethers.hexlify(ethers.randomBytes(32)), 32),
        } as SolidityOrder;

        const order = new Order();
        order.raw = JSON.stringify(solidityOrder);
        order.maker = solidityOrder.maker;
        order.contractAddress = contract;
        order.tokenId = this.toUint256(tokenId);
        order.price = this.toUint256(price);
        order.expirationTime = expirationTime;
        order.isSell = false;
        order.verified = false;

        return await this.orderRepository.save(order)
    }

    async generateBuyOrderFromFixedPriceSell(orderId: number, maker: string){
        const order = await this.orderRepository.findOneBy({
            id: orderId,
            verified: true,
            isSell: true
        });

        if (!order) {
            throw new HttpException('not exist', HttpStatus.BAD_REQUEST);
        }

        if (order.expirationTime < new Date().getDate() / 1000) {
            throw new HttpException('expired order', HttpStatus.BAD_REQUEST);
        }
        
        const sellOrder = JSON.parse(order.raw);

        if (sellOrder.saleKind !== 0) {
            throw new HttpException('not fixed price', HttpStatus.BAD_REQUEST);
        }

        return {
            exchange: this.exchangeAddress,
            maker: maker,
            taker: '0x0000000000000000000000000000000000000000',
            saleSide: 0,
            saleKind: sellOrder.saleKind,
            target: sellOrder.target,
            paymentToken: sellOrder.paymentTarget,
            calldata_: [
                '0x42842e0e', 
                // v6: ethers.zeroPadValue 사용
                ethers.zeroPadValue(maker, 32).replace('0x', ''),
                ethers.zeroPadValue('0x00', 32).replace('0x', ''),
                this.toUint256(order.tokenId).replace('0x', ''),
            ].join(''),
            replacementPattern: [
                '00000000',
                'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 
                '0000000000000000000000000000000000000000000000000000000000000000',
                '0000000000000000000000000000000000000000000000000000000000000000'
            ].join(''),
            staticTarget: '0x0000000000000000000000000000000000000000',
            staticExtra: '0x',
            // v6: ethers.toBeHex 사용
            basePrice: sellOrder.basePrice,
            endPrice: sellOrder.endPrice,
            listingTime: sellOrder.listingTime,
            expirationTime: sellOrder.expirationTime,
            // v6: ethers.randomBytes와 ethers.zeroPadValue 사용
            salt: ethers.zeroPadValue(ethers.hexlify(ethers.randomBytes(32)), 32),
        } as SolidityOrder;
    }

    async generateSellOrderFromOffer(orderId: number, maker: string){
        const order = await this.orderRepository.findOneBy({
            id: orderId,
            verified: true,
            isSell: false
        });

        if (!order) {
            throw new HttpException('not exist', HttpStatus.BAD_REQUEST);
        }

        if (order.expirationTime < new Date().getDate() / 1000) {
            throw new HttpException('expired order', HttpStatus.BAD_REQUEST);
        }
        
        const buyOrder = JSON.parse(order.raw);

        if (buyOrder.saleKind !== 0) {
            throw new HttpException('not fixed price', HttpStatus.BAD_REQUEST);
        }

        return {
            exchange: this.exchangeAddress,
            maker: maker,
            taker: '0x0000000000000000000000000000000000000000',
            saleSide: 1,
            saleKind: buyOrder.saleKind,
            target: buyOrder.target,
            paymentToken: buyOrder.paymentTarget,
            calldata_: [
                '0x42842e0e', 
                // v6: ethers.zeroPadValue 사용
                ethers.zeroPadValue(maker, 32).replace('0x', ''),
                ethers.zeroPadValue('0x00', 32).replace('0x', ''),
                this.toUint256(order.tokenId).replace('0x', ''),
            ].join(''),
            replacementPattern: [
                '00000000',
                '0000000000000000000000000000000000000000000000000000000000000000',
                'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 
                '0000000000000000000000000000000000000000000000000000000000000000'
            ].join(''),
            staticTarget: '0x0000000000000000000000000000000000000000',
            staticExtra: '0x',
            // v6: ethers.toBeHex 사용
            basePrice: buyOrder.basePrice,
            endPrice: buyOrder.endPrice,
            listingTime: buyOrder.listingTime,
            expirationTime: buyOrder.expirationTime,
            // v6: ethers.randomBytes와 ethers.zeroPadValue 사용
            salt: ethers.zeroPadValue(ethers.hexlify(ethers.randomBytes(32)), 32),
        } as SolidityOrder;
    }

    async validateOrder(orderId: number, sig: OrderSig) {
        const dbOrder = await this.orderRepository.findOneBy({ id: orderId });

        if (!dbOrder) {
            return false;
        }

        const solidityOrder = JSON.parse(dbOrder.raw) as SolidityOrder;

        if (dbOrder.isSell) {
            const userProxyAddress = await this.getProxyAddress(dbOrder.maker);

            if (userProxyAddress === '0x0000000000000000000000000000000000000000') {
                return false;
            }

            const nftContract = new ethers.Contract(
                dbOrder.contractAddress,
                erc721Abi,
                this.provider
            );

            if(
                !(await nftContract.isApprovedForAll(dbOrder.maker, userProxyAddress))
            ) {
                return false
            }

            const tokenOwner = await nftContract.ownerOf(dbOrder.tokenId);

            // v6: BigInt 비교 사용
            if (BigInt(tokenOwner) !== BigInt(dbOrder.maker)) {
                return false
            }
        } else {
            const erc20Contract = new ethers.Contract(
                solidityOrder.paymentToken,
                erc20Abi, 
                this.provider
            );

            const allowance = await erc20Contract.allowance(
                dbOrder.maker, 
                this.exchangeAddress
            );

            const balance = await erc20Contract.balanceOf(dbOrder.maker);

            if (BigNumber.from(allowance).lt(BigNumber.from(dbOrder.price))) {
                return false;
            }

            if (BigNumber.from(allowance).lt(BigNumber.from(dbOrder.price))) {
                return false;
            }

        }

        try {
            await this.callVerification(solidityOrder, sig);

            dbOrder.verified = true;
            dbOrder.signature = `${sig.r}${sig.s}${sig.v}`.replace(/0x/g, '');
            await this.orderRepository.save(dbOrder);
        } catch (e) {
            return false
        }
    }

    async getSellOrders(contract: string, tokenId: string) {
        const nftContract = new ethers.Contract(contract, erc721Abi, this.provider);

        // v6: ethers.toBeHex 사용
        const owner = (await nftContract
            .ownerOf(ethers.toBeHex(BigInt(tokenId))))
            .toLowerCase();

        return await this.orderRepository.find({
            where: {
                contractAddress: contract,
                tokenId: this.toUint256(tokenId),
                maker: owner,
                expirationTime: LessThanOrEqual(new Date().getTime()),
                verified: true,
                isSell: true,
            },
            order: {
                price: 'asc'
            }
        })
    }

    async getOfferOrders(contract: string, tokenId: string) {
        return await this.orderRepository.find({
            where: {
                contractAddress: contract,
                tokenId: this.toUint256(tokenId),
                isSell: false,
                expirationTime: LessThanOrEqual(new Date().getTime()),
                verified: true,
            },
            order: {
                price: 'desc'
            }
        })
    }

    async callVerification(order: SolidityOrder, sig: OrderSig) {
        await this.exchangeContract.validateOrder([
          order.exchange,
          order.maker,
          order.taker,
          order.saleSide,
          order.saleKind,
          order.target,
          order.paymentToken,
          order.calldata_,
          order.replacementPattern,
          order.staticTarget,
          order.staticExtra,
          order.basePrice,
          order.endPrice,
          order.listingTime,
          order.expirationTime,
          order.salt
        ], 
        [
          sig.r,
          sig.s,
          sig.v
        ])
    }

    async getProxyAddress(address: string) {
        return await this.proxyRegistryContract.proxies(address);
    }

    toUint256(id: string) {
        // v6: ethers.zeroPadValue와 ethers.toBeHex 사용
        return ethers.zeroPadValue(ethers.toBeHex(BigInt(id)), 32)
    }
}