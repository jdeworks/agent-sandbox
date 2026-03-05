import { Router } from 'express';
import settingsRouter from './settings';
import uploadRouter from './upload';
import scannersRouter from './scanners';
import scansRouter from './scans';

const router = Router();

router.use('/settings', settingsRouter);
router.use('/scans', scansRouter);
router.use('/upload', uploadRouter);
router.use('/scanners', scannersRouter);

export default router;
