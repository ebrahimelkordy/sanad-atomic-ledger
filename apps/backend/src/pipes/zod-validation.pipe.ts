import { ArgumentMetadata, Injectable, PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

/**
 * Global Zod validation pipe. If a route method has `@Body(new ZodValidationPipe(mySchema))`
 * OR the controller passes a ZodSchema via metadata, validation kicks in.
 *
 * Also provides a static helper `validate(schema, value)` for imperative use.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform<any> {
  constructor(private readonly schema?: ZodSchema<any>) {}

  transform(value: any, _metadata?: ArgumentMetadata): any {
    if (!this.schema) return value;
    return ZodValidationPipe.validate(this.schema, value);
  }

  static validate<T>(schema: ZodSchema<T>, value: unknown): T {
    try {
      return schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.issues.map(i => `${i.path.join('.') ?? 'value'}: ${i.message}`).join('; ');
        throw new BadRequestException(`Validation failed: ${message}`);
      }
      throw new BadRequestException('Validation failed');
    }
  }
}
