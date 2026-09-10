import { Router, type IRouter } from "express";
import healthRouter from "./health";
import chatRouter from "./chat";
import groupsRouter from "./groups";
import integrationsRouter from "./integrations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(chatRouter);
router.use(groupsRouter);
router.use(integrationsRouter);

export default router;
