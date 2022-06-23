import React from 'react';
import ReactDOM from 'react-dom';

import {usePortal} from 'src/hooks';

type Props = {
    children: React.ReactNode
}

const Portal = ({children}: Props) => {
    const el = usePortal();
    return ReactDOM.createPortal(children, el);
};

export default React.memo(Portal);
