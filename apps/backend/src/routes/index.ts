import { Router } from 'express';
import scansRouter from './scans';

const router = Router();

router.use('/scans', scansRouter);

export default router;
