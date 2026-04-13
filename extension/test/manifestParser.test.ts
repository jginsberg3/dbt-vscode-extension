import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseManifest } from '../src/manifest/manifestParser';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'manifest.json');

describe('parseManifest', () => {
    const manifest = parseManifest(FIXTURE_PATH);

    describe('metadata', () => {
        it('extracts the project name', () => {
            expect(manifest.projectName).toBe('test_project');
        });
    });

    describe('model parsing', () => {
        it('extracts only model nodes (filters out tests, seeds)', () => {
            expect(manifest.allModels.length).toBe(3);
            const names = manifest.allModels.map(m => m.name).sort();
            expect(names).toEqual(['customers', 'revenue', 'stg_orders']);
        });

        it('indexes models by name', () => {
            expect(manifest.modelsByName.has('customers')).toBe(true);
            expect(manifest.modelsByName.has('stg_orders')).toBe(true);
            expect(manifest.modelsByName.has('revenue')).toBe(true);
        });

        it('does not include test or seed nodes in modelsByName', () => {
            expect(manifest.modelsByName.has('not_null_customers_customer_id')).toBe(false);
            expect(manifest.modelsByName.has('raw_customers')).toBe(false);
        });

        it('indexes models by file path', () => {
            expect(manifest.modelsByFilePath.has('models/customers.sql')).toBe(true);
            expect(manifest.modelsByFilePath.has('models/staging/stg_orders.sql')).toBe(true);
        });

        it('preserves model properties', () => {
            const customers = manifest.modelsByName.get('customers')!;
            expect(customers.description).toBe('Final customers table with order summaries');
            expect(customers.config.materialized).toBe('table');
            expect(customers.package_name).toBe('test_project');
            expect(customers.database).toBe('analytics');
            expect(customers.schema).toBe('public');
        });

        it('preserves column data on models', () => {
            const customers = manifest.modelsByName.get('customers')!;
            expect(Object.keys(customers.columns)).toEqual(['customer_id', 'customer_name', 'total_orders']);
            expect(customers.columns['customer_id'].description).toBe('The primary key');
            expect(customers.columns['customer_id'].data_type).toBe('integer');
        });

        it('handles models with empty columns', () => {
            const stgOrders = manifest.modelsByName.get('stg_orders')!;
            expect(Object.keys(stgOrders.columns)).toEqual([]);
        });

        it('handles models with empty description', () => {
            const revenue = manifest.modelsByName.get('revenue')!;
            expect(revenue.description).toBe('');
        });
    });

    describe('parent/child maps', () => {
        it('builds parent map filtered to models only', () => {
            const customersParents = manifest.parentMap.get('model.test_project.customers');
            expect(customersParents).toEqual(['model.test_project.stg_orders']);
        });

        it('filters non-model parents from parent map', () => {
            // stg_orders depends on a source, which should be filtered out
            const stgOrdersParents = manifest.parentMap.get('model.test_project.stg_orders');
            expect(stgOrdersParents).toEqual([]);
        });

        it('builds child map filtered to models only', () => {
            const stgOrdersChildren = manifest.childMap.get('model.test_project.stg_orders');
            expect(stgOrdersChildren).toEqual([
                'model.test_project.customers',
                'model.test_project.revenue',
            ]);
        });

        it('filters non-model children from child map', () => {
            // customers has a test child that should be filtered out
            const customersChildren = manifest.childMap.get('model.test_project.customers');
            expect(customersChildren).toEqual(['model.test_project.revenue']);
        });
    });

    describe('source parsing', () => {
        it('extracts all sources', () => {
            expect(manifest.allSources.length).toBe(3);
        });

        it('groups sources by source_name', () => {
            expect(manifest.sourcesByName.has('stripe')).toBe(true);
            expect(manifest.sourcesByName.has('hubspot')).toBe(true);
        });

        it('groups multiple tables under the same source', () => {
            const stripeTables = manifest.sourcesByName.get('stripe')!;
            expect(stripeTables.length).toBe(2);
            const names = stripeTables.map(t => t.name).sort();
            expect(names).toEqual(['customers', 'payments']);
        });

        it('preserves source properties', () => {
            const stripeTables = manifest.sourcesByName.get('stripe')!;
            const payments = stripeTables.find(t => t.name === 'payments')!;
            expect(payments.description).toBe('Raw payment events from Stripe');
            expect(payments.database).toBe('raw_db');
            expect(payments.schema).toBe('stripe_data');
        });

        it('preserves source column data', () => {
            const stripeTables = manifest.sourcesByName.get('stripe')!;
            const payments = stripeTables.find(t => t.name === 'payments')!;
            expect(payments.columns['payment_id'].description).toBe('Unique payment identifier');
            expect(payments.columns['amount'].data_type).toBe('integer');
        });
    });
});
