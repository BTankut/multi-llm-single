import { RequestInit } from 'node-fetch';

export interface StreamOptions {
    stream: boolean;
    onToken?: (token: string) => void;
    onError?: (error: Error) => void;
    signal?: RequestInit['signal'];
}

export interface OpenRouterModel {
    id: string;
    name: string;
    description: string;
    pricing: {
        prompt: string;
        completion: string;
    };
    context_length: number;
}
