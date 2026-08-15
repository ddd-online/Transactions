import type {TransactionRecord, TrForm} from "@/types/transactions";
import dayjs from "dayjs";
import {centsToYuan, yuanToCents} from "@/backend/functions.ts";

/**
 * 构造符合后端 TransactionRecordDto 的请求对象 表单数据转化为dto
 */
export function trFormToTrDto(data: TrForm, ledgerId: string = ''): TransactionRecord {
    let tr: TransactionRecord = {
        ledgerId: ledgerId,
        transactionId: data.id,
        price: yuanToCents(data.price),
        transactionType: data.type,
        category: data.category,
        description: data.description,
        tags: data.tags,
        transactionAt: data.time.unix(),
        outlier: false,
        keyEventDate: data.keyEventDate || '',
    };

    if (data.flags.includes('outlier')) {
        tr.outlier = true;
    }

    return tr;
}

/**
 * 将后端返回的 TransactionRecord DTO 转换为前端使用的 TrForm 表单对象
 */
export function trDtoToTrForm(dto: TransactionRecord): TrForm {
    let trForm: TrForm = {
        id: dto.transactionId,
        price: centsToYuan(dto.price),
        type: dto.transactionType,
        category: dto.category,
        description: dto.description,
        tags: dto.tags,
        flags: [],
        time: dayjs(dto.transactionAt * 1000),
        keyEventDate: dto.keyEventDate || '',
    };

    if (dto.outlier) {
        trForm.flags.push('outlier');
    }

    return trForm;
}